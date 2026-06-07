import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { getProductByIdScoped } from '../../shared/odoo-store-ops.js';

export async function productsRoutes(
  app: FastifyInstance,
  _opts: { redis: Redis; config: AppConfig },
) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  app.get(
    '/api/v1/stores/:storeId/products',
    {
      schema: {
        summary: 'Listar productos del catálogo de la farmacia',
        description:
          'Auth: JWT (scoped). Lee de la DB Odoo de la farmacia (vendibles).\n\n' +
          'Respuesta: array `{ id, name, price, stock, category, categoryId, barcode, tracking, hasExpiry }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Filtro ilike por nombre' },
            limit: { type: 'integer', description: 'Default 50' },
            offset: { type: 'integer', description: 'Default 0' },
          },
        },
      },
    },
    async (request: FastifyRequest) => {
      const { search, limit, offset } = request.query as {
        search?: string;
        limit?: string;
        offset?: string;
      };

      const domain: unknown[][] = [['sale_ok', '=', true]];
      if (search) domain.push(['name', 'ilike', search]);

      const products = (await request.odoo.execute(
        'product.product',
        'search_read',
        [domain],
        {
          fields: [
            'name',
            'list_price',
            'qty_available',
            'categ_id',
            'barcode',
            'tracking',
            'use_expiration_date',
          ],
          limit: parseInt(limit || '50'),
          offset: parseInt(offset || '0'),
          order: 'name asc',
        },
      )) as Array<Record<string, unknown>>;

      return products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.list_price,
        stock: p.qty_available,
        category: (p.categ_id as [number, string])?.[1] || 'Sin categoría',
        categoryId: (p.categ_id as [number, string])?.[0],
        barcode: p.barcode || null,
        tracking: p.tracking,
        hasExpiry: p.use_expiration_date,
      }));
    },
  );

  app.get(
    '/api/v1/stores/:storeId/products/:productId',
    {
      schema: {
        summary: 'Detalle de un producto',
        description: 'Auth: JWT (scoped). 404 si no existe en la DB de la farmacia.',
        params: {
          type: 'object',
          properties: {
            storeId: { type: 'string' },
            productId: { type: 'integer', description: 'product.product id en Odoo' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId } = request.params as { storeId: string; productId: string };
      const product = await getProductByIdScoped(request.odoo, parseInt(productId));
      if (!product) return reply.status(404).send({ error: 'Product not found' });
      return {
        id: product.id,
        name: product.name,
        price: product.list_price,
        stock: product.qty_available,
        category: (product.categ_id as [number, string])?.[1] || 'Sin categoría',
        barcode: product.barcode || null,
        tracking: product.tracking,
        hasExpiry: product.use_expiration_date,
      };
    },
  );
}
