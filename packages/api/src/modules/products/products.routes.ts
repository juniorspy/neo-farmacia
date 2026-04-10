import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { searchProducts, getProductById, odooExecute } from '../../shared/odoo.js';

export async function productsRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const { redis, config } = opts;

  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/stores/:storeId/products
  app.get('/api/v1/stores/:storeId/products', async (request: FastifyRequest) => {
    const { storeId } = request.params as { storeId: string };
    const { search, limit, offset } = request.query as {
      search?: string;
      limit?: string;
      offset?: string;
    };

    // Use search if provided, otherwise list all
    const domain: unknown[][] = [['sale_ok', '=', true]];
    if (search) {
      domain.push(['name', 'ilike', search]);
    }

    const products = await odooExecute(
      'product.product',
      'search_read',
      [domain],
      {
        fields: [
          'name', 'list_price', 'qty_available', 'categ_id',
          'barcode', 'tracking', 'use_expiration_date',
        ],
        limit: parseInt(limit || '50'),
        offset: parseInt(offset || '0'),
        order: 'name asc',
      },
    );

    return (products as Record<string, unknown>[]).map((p) => ({
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
  });

  // GET /api/v1/stores/:storeId/products/:productId
  app.get('/api/v1/stores/:storeId/products/:productId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId } = request.params as { storeId: string; productId: string };

    const product = await getProductById(parseInt(productId));
    if (!product) {
      return reply.status(404).send({ error: 'Product not found' });
    }

    return {
      id: product.id,
      name: product.name,
      price: product.list_price,
      stock: product.qty_available,
      category: product.categ_id?.[1] || 'Sin categoría',
      barcode: product.barcode || null,
      tracking: product.tracking,
      hasExpiry: product.use_expiration_date,
    };
  });
}
