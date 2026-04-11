import type Redis from 'ioredis';
import { searchProducts } from '../../../shared/odoo.js';
import type { CommandContext, CommandResult } from '../types.js';
import type { AppConfig } from '../../../config/env.js';

// catalogo.search — search products in Odoo (with Redis cache)
export async function catalogoSearch(
  ctx: CommandContext,
  deps: { redis: Redis; config: AppConfig },
): Promise<CommandResult> {
  const { q, limit } = ctx.payload as { q?: string; limit?: number };
  const { storeId } = ctx;
  const { redis, config } = deps;

  if (!q) {
    return { ok: false, error: 'q (query) required' };
  }

  // Check cache
  const cacheKey = `cache:products:${storeId}:${q.toLowerCase()}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return { ok: true, result: { items: JSON.parse(cached) } };
  }

  const products = await searchProducts(q, storeId, limit || 10) as Array<Record<string, unknown>>;

  const items = products.map((p) => ({
    productoId: p.id,
    nombre: p.name,
    precio: p.list_price,
    precioSugerido: p.list_price,
    stock: p.qty_available,
    disponibleVentas: (p.qty_available as number) > 0,
    unidadVenta: 'unidad',
    barcode: p.barcode || null,
    categoria: (p.categ_id as [number, string])?.[1] || null,
  }));

  await redis.set(cacheKey, JSON.stringify(items), 'EX', config.cache.productTtlSec);

  return { ok: true, result: { items } };
}
