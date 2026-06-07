import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { Store, type IStore } from '../provisioning/store.model.js';
import { getScopedOdoo } from '../../shared/odoo-scoped-cache.js';
import { searchIndex } from '../../shared/meilisearch.js';
import {
  findOrCreatePartnerScoped,
  createSaleOrderScoped,
  getProductByIdScoped,
} from '../../shared/odoo-store-ops.js';
import { User } from '../users/user.model.js';
import { logger } from '../../shared/logger.js';

/**
 * Public storefront — the plug-and-play online store per pharmacy. No auth:
 * the catalog is the same info on the shelf, and orders are placed by walk-up
 * customers (pay on delivery / at the counter, rule #12). A web order creates
 * a sale.order in the pharmacy's own Odoo DB tagged `client_order_ref='web'`,
 * so it lands in the SAME /orders dashboard queue as WhatsApp and voice — one
 * inbox for every channel. Prices are always read server-side; the client
 * never sets a price.
 */

const MAX_QTY_PER_LINE = 99;
const ORDER_RATE_LIMIT = 5; // per IP per window
const ORDER_RATE_WINDOW_S = 600;

/** Resolve an active store or reply with the right error. Returns null after replying. */
async function resolveActiveStore(
  storeId: string,
  reply: FastifyReply,
): Promise<IStore | null> {
  const store = await Store.findOne({ store_id: storeId }).lean<IStore>();
  if (!store) {
    reply.status(404).send({ error: 'store not found' });
    return null;
  }
  if (store.status !== 'active') {
    reply.status(409).send({ error: 'store not available' });
    return null;
  }
  return store;
}

export async function storefrontRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const { redis, config } = opts;

  // ── Public store info (header, currency, delivery) ──
  app.get(
    '/api/v1/storefront/:storeId',
    {
      schema: {
        summary: 'Info pública de la tienda (header del storefront)',
        description:
          'Auth: ninguna (público). 404 si no existe, 409 si la farmacia no está activa.\n\n' +
          'Respuesta: `{ store_id, name, currency, delivery_info, business_hours }`.',
        params: { type: 'object', properties: { storeId: { type: 'string' } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.params as { storeId: string };
      const store = await resolveActiveStore(storeId, reply);
      if (!store) return;
      return {
        store_id: store.store_id,
        name: store.name,
        currency: store.currency,
        delivery_info: store.agent_config?.delivery_info || '',
        business_hours: store.agent_config?.business_hours || '',
      };
    },
  );

  // ── Public catalog (Meilisearch-backed) ──
  app.get(
    '/api/v1/storefront/:storeId/products',
    {
      schema: {
        summary: 'Catálogo público de la tienda (búsqueda Meilisearch)',
        description:
          'Auth: ninguna. Query vacía devuelve el catálogo completo paginado.\n\n' +
          'Respuesta: `{ total, products: [{ id, name, price, stock, category, barcode, image_url }] }`.',
        params: { type: 'object', properties: { storeId: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Texto de búsqueda (vacío = todo)' },
            limit: { type: 'integer', description: 'Default 24, máx 48' },
            offset: { type: 'integer', description: 'Default 0' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.params as { storeId: string };
      const { q, limit, offset } = request.query as {
        q?: string;
        limit?: string;
        offset?: string;
      };
      const store = await resolveActiveStore(storeId, reply);
      if (!store) return;

      try {
        const result = await searchIndex(store.meilisearch_index, q || '', {
          limit: Math.min(parseInt(limit || '24'), 48),
          offset: parseInt(offset || '0'),
        });
        return {
          total: result.estimatedTotalHits,
          products: result.hits.map((h) => ({
            id: h.id,
            name: h.name,
            price: h.price,
            stock: h.stock,
            category: h.category,
            barcode: h.barcode || null,
            image_url: h.image_url || null,
          })),
        };
      } catch (err) {
        logger.error({ err, storeId }, 'storefront catalog search failed');
        return reply.status(502).send({ error: 'catalog unavailable' });
      }
    },
  );

  // ── Public product detail ──
  app.get(
    '/api/v1/storefront/:storeId/products/:productId',
    {
      schema: {
        summary: 'Detalle público de un producto',
        description: 'Auth: ninguna. 404 si no existe en el catálogo de la farmacia.',
        params: {
          type: 'object',
          properties: {
            storeId: { type: 'string' },
            productId: { type: 'integer' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId, productId } = request.params as { storeId: string; productId: string };
      const store = await resolveActiveStore(storeId, reply);
      if (!store) return;
      const odoo = getScopedOdoo(config, store.odoo_db);
      const product = await getProductByIdScoped(odoo, parseInt(productId));
      if (!product) return reply.status(404).send({ error: 'product not found' });
      return {
        id: product.id,
        name: product.name,
        price: product.list_price,
        stock: product.qty_available,
        category: (product.categ_id as [number, string])?.[1] || 'Sin categoría',
        barcode: product.barcode || null,
      };
    },
  );

  // ── Place an order (public, pay on delivery) ──
  app.post(
    '/api/v1/storefront/:storeId/orders',
    {
      schema: {
        summary: 'Crear pedido desde la tienda online (pago contra entrega)',
        description:
          'Auth: ninguna. Crea un sale.order en la DB Odoo de la farmacia tag `client_order_ref=web` → ' +
          'aparece en el panel /orders junto a los de WhatsApp. Los precios se leen del catálogo en el ' +
          'servidor (el cliente nunca fija precio). Rate limit por IP.\n\n' +
          'Respuesta 201: `{ orderId, name, total }`.',
        params: { type: 'object', properties: { storeId: { type: 'string' } } },
        body: {
          type: 'object',
          required: ['customer', 'items'],
          properties: {
            customer: {
              type: 'object',
              required: ['name', 'phone', 'address'],
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
                address: { type: 'string' },
              },
            },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['productId', 'qty'],
                properties: {
                  productId: { type: 'integer' },
                  qty: { type: 'number' },
                },
              },
            },
            note: { type: 'string', description: 'Nota opcional del cliente' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { storeId } = request.params as { storeId: string };
      const store = await resolveActiveStore(storeId, reply);
      if (!store) return;

      const body = request.body as {
        customer: { name: string; phone: string; address: string };
        items: Array<{ productId: number; qty: number }>;
        note?: string;
      };
      const name = body.customer.name.trim();
      const phone = body.customer.phone.trim();
      const address = body.customer.address.trim();
      if (!name || !phone || !address) {
        return reply.status(400).send({ error: 'name, phone and address are required' });
      }
      const items = body.items.filter((i) => i && i.productId && i.qty > 0);
      if (items.length === 0) {
        return reply.status(400).send({ error: 'at least one item required' });
      }

      // Anti-abuse: cap orders per IP per window (public write endpoint).
      const rlKey = `rl:storefront:order:${storeId}:${request.ip}`;
      const hits = await redis.incr(rlKey);
      if (hits === 1) await redis.expire(rlKey, ORDER_RATE_WINDOW_S);
      if (hits > ORDER_RATE_LIMIT) {
        return reply.status(429).send({ error: 'too many orders, try again later' });
      }

      const odoo = getScopedOdoo(config, store.odoo_db);

      // Validate + price every item server-side. Never trust client prices.
      const ids = [...new Set(items.map((i) => i.productId))];
      const products = (await odoo.execute('product.product', 'read', [ids], {
        fields: ['id', 'name', 'list_price', 'sale_ok'],
      })) as Array<{ id: number; name: string; list_price: number; sale_ok: boolean }>;
      const byId = new Map(products.map((p) => [p.id, p]));

      const lines: Array<{ productId: number; quantity: number; price: number }> = [];
      for (const it of items) {
        const p = byId.get(it.productId);
        if (!p || !p.sale_ok) {
          return reply.status(422).send({ error: `product ${it.productId} is not available` });
        }
        lines.push({
          productId: it.productId,
          quantity: Math.min(Math.floor(it.qty), MAX_QTY_PER_LINE),
          price: p.list_price,
        });
      }

      const partner = await findOrCreatePartnerScoped(odoo, name, phone);

      const noteLines = ['— Pedido tienda online —', `Cliente: ${name}`, `Tel: ${phone}`, `Entrega: ${address}`];
      if (body.note) noteLines.push(`Nota: ${body.note.slice(0, 300)}`);

      let orderId: number;
      try {
        orderId = await createSaleOrderScoped(odoo, partner.id, lines, {
          clientOrderRef: 'web',
          note: noteLines.join('\n'),
        });
      } catch (err) {
        logger.error({ err, storeId }, 'storefront order create failed');
        return reply.status(500).send({ error: 'could not place order' });
      }

      // Persist the customer so they show up in /customers (web chat_id keeps
      // the store_id+chat_id unique index happy; deduped with WhatsApp later).
      await User.updateOne(
        { store_id: storeId, chat_id: `web:${phone}` },
        {
          $set: { phone, name, address, updated_at: new Date() },
          $setOnInsert: {
            store_id: storeId,
            chat_id: `web:${phone}`,
            registered: false,
            created_at: new Date(),
          },
        },
        { upsert: true },
      ).catch((err) => logger.warn({ err, storeId }, 'web customer upsert failed'));

      const [order] = (await odoo.execute('sale.order', 'read', [[orderId]], {
        fields: ['name', 'amount_total'],
      })) as Array<{ name: string; amount_total: number }>;

      logger.info({ storeId, orderId, items: lines.length }, 'Web storefront order placed');
      return reply.status(201).send({
        orderId,
        name: order?.name ?? null,
        total: order?.amount_total ?? 0,
      });
    },
  );
}
