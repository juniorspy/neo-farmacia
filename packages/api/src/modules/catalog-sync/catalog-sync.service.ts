import { odooExecute } from '../../shared/odoo.js';
import {
  ensureIndex,
  upsertDocuments,
  deleteDocuments,
  setSynonyms,
  getStoreIndexName,
  type ProductDoc,
} from '../../shared/meilisearch.js';
import { logger } from '../../shared/logger.js';
import { PHARMACY_SYNONYMS } from './synonyms.seed.js';

// Track last sync per store to do incremental syncs
const lastSyncByStore = new Map<string, Date>();

function odooProductToDoc(p: Record<string, unknown>): ProductDoc {
  return {
    id: p.id as number,
    default_code: (p.default_code as string) || null,
    name: (p.name as string) || '',
    description: (p.description_sale as string) || '',
    category: (p.categ_id as [number, string])?.[1] || 'Sin categoría',
    category_id: (p.categ_id as [number, string])?.[0] || 0,
    price: (p.list_price as number) || 0,
    stock: (p.qty_available as number) || 0,
    barcode: (p.barcode as string) || null,
    image_url: p.default_code ? `/products/${(p.default_code as string).replace('CAROL-', '')}.jpg` : null,
  };
}

/**
 * Full rebuild of the store's Meilisearch index from Odoo.
 * Creates the index if missing, upserts all saleable products,
 * applies the default synonyms seed.
 */
export async function fullRebuildStoreIndex(storeId: string): Promise<number> {
  const indexName = getStoreIndexName(storeId);
  logger.info({ storeId, indexName }, 'Full rebuild starting');

  await ensureIndex(indexName);

  // Fetch all saleable products from Odoo
  const products = await odooExecute(
    'product.product',
    'search_read',
    [[['sale_ok', '=', true]]],
    {
      fields: [
        'id', 'name', 'default_code', 'list_price', 'qty_available',
        'categ_id', 'barcode', 'description_sale',
      ],
      limit: 10000,
    },
  ) as Array<Record<string, unknown>>;

  const docs = products.map(odooProductToDoc);

  // Batch upserts (Meilisearch handles up to ~100k per batch, we use 500 for safety)
  const BATCH_SIZE = 500;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    await upsertDocuments(indexName, batch);
  }

  // Apply synonyms
  await setSynonyms(indexName, PHARMACY_SYNONYMS);

  lastSyncByStore.set(storeId, new Date());

  logger.info({ storeId, count: docs.length }, 'Full rebuild complete');
  return docs.length;
}

/**
 * Incremental sync: push only products modified since last sync.
 */
export async function incrementalSyncStore(storeId: string): Promise<number> {
  const indexName = getStoreIndexName(storeId);
  const since = lastSyncByStore.get(storeId);

  if (!since) {
    // No previous sync — do a full rebuild
    return fullRebuildStoreIndex(storeId);
  }

  // Format as Odoo datetime string: "YYYY-MM-DD HH:MM:SS"
  const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ');

  const products = await odooExecute(
    'product.product',
    'search_read',
    [[
      ['sale_ok', '=', true],
      ['write_date', '>', sinceStr],
    ]],
    {
      fields: [
        'id', 'name', 'default_code', 'list_price', 'qty_available',
        'categ_id', 'barcode', 'description_sale',
      ],
      limit: 1000,
    },
  ) as Array<Record<string, unknown>>;

  if (products.length === 0) {
    logger.debug({ storeId }, 'Incremental sync: no changes');
    lastSyncByStore.set(storeId, new Date());
    return 0;
  }

  const docs = products.map(odooProductToDoc);
  await upsertDocuments(indexName, docs);
  lastSyncByStore.set(storeId, new Date());

  logger.info({ storeId, count: docs.length }, 'Incremental sync complete');
  return docs.length;
}

/**
 * Start periodic background sync for all stores.
 * Called once at app startup.
 */
let syncInterval: NodeJS.Timeout | null = null;

export function startPeriodicSync(intervalMs: number = 10 * 60 * 1000) {
  if (syncInterval) return;

  // Known stores — for now just store_leo. In the future, read from a stores collection.
  const stores = ['store_leo'];

  async function runSync() {
    for (const storeId of stores) {
      try {
        await incrementalSyncStore(storeId);
      } catch (err) {
        logger.error({ err, storeId }, 'Periodic sync failed');
      }
    }
  }

  // Run once after a short delay to let the app finish booting
  setTimeout(() => {
    runSync().catch((err) => logger.error({ err }, 'Initial sync failed'));
  }, 5000);

  // Then every intervalMs
  syncInterval = setInterval(runSync, intervalMs);
  logger.info({ intervalMs, stores }, 'Periodic catalog sync started');
}

export function stopPeriodicSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
