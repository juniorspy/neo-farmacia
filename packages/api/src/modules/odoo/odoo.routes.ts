import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { searchProducts, createSaleOrder, findOrCreatePartner, getProductById } from '../../shared/odoo.js';
import { logger } from '../../shared/logger.js';

export async function odooRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const { redis, config } = opts;

  // Search products — called by n8n Dialogue Agent
  app.post('/api/v1/products/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const { query, storeId, limit } = request.body as {
      query: string;
      storeId: string;
      limit?: number;
    };

    if (!query || !storeId) {
      return reply.status(400).send({ error: 'query and storeId required' });
    }

    // Check Redis cache
    const cacheKey = `cache:products:${storeId}:${query.toLowerCase()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ storeId, query }, 'Product search cache hit');
      return JSON.parse(cached);
    }

    const products = await searchProducts(query, storeId, limit || 10);

    // Cache results
    await redis.set(cacheKey, JSON.stringify(products), 'EX', config.cache.productTtlSec);

    return products;
  });

  // Get product by ID
  app.get('/api/v1/products/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const product = await getProductById(parseInt(id));
    if (!product) return reply.status(404).send({ error: 'Product not found' });
    return product;
  });

  // Create/update order — called by n8n Cart Agent
  app.post('/api/v1/orders/update', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      storeId: string;
      chatId: string;
      customerName: string;
      customerPhone: string;
      items: Array<{ productId: number; quantity: number; price: number }>;
    };

    if (!body.storeId || !body.items?.length) {
      return reply.status(400).send({ error: 'storeId and items required' });
    }

    // Find or create customer in Odoo
    const partner = await findOrCreatePartner(
      body.customerName || 'WhatsApp Customer',
      body.customerPhone || '',
    );

    // Create sale order
    const orderId = await createSaleOrder(
      partner.id,
      body.items,
    );

    logger.info({ orderId, storeId: body.storeId, items: body.items.length }, 'Order created');

    return { success: true, orderId, partnerId: partner.id };
  });
}
