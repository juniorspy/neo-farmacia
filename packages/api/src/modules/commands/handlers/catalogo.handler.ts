import type Redis from 'ioredis';
import { searchIndex, getStoreIndexName } from '../../../shared/meilisearch.js';
import { logger } from '../../../shared/logger.js';
import type { CommandContext, CommandResult } from '../types.js';
import type { AppConfig } from '../../../config/env.js';

// catalogo.search — search products via Meilisearch (with synonyms + typo tolerance)
export async function catalogoSearch(
  ctx: CommandContext,
  _deps: { redis: Redis; config: AppConfig },
): Promise<CommandResult> {
  const { q, limit } = ctx.payload as { q?: string; limit?: number };
  const { storeId } = ctx;

  if (!q) {
    return { ok: false, error: 'q (query) required' };
  }

  const indexName = getStoreIndexName(storeId);

  try {
    const result = await searchIndex(indexName, q, { limit: limit || 10 });

    const items = result.hits.map((hit) => ({
      productoId: hit.id,
      sku: hit.default_code,
      nombre: hit.name,
      precio: hit.price,
      precioSugerido: hit.price,
      stock: hit.stock,
      disponibleVentas: hit.stock > 0 || true,
      unidadVenta: 'unidad',
      barcode: hit.barcode || null,
      categoria: hit.category,
      imagen: hit.image_url || null,
    }));

    return {
      ok: true,
      result: {
        items,
        total: result.estimatedTotalHits,
        processingTimeMs: result.processingTimeMs,
      },
    };
  } catch (err) {
    logger.error({ err, storeId, q }, 'Meilisearch query failed');
    return { ok: false, error: 'search failed' };
  }
}
