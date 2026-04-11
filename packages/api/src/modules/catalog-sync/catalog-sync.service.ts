import type { AppConfig } from '../../config/env.js';
import type { ScopedOdoo } from '../../shared/odoo-scoped.js';
import { getScopedOdoo } from '../../shared/odoo-scoped-cache.js';
import {
  ensureIndex,
  upsertDocuments,
  setSynonyms,
  type ProductDoc,
} from '../../shared/meilisearch.js';
import { logger } from '../../shared/logger.js';
import { PHARMACY_SYNONYMS } from './synonyms.seed.js';
import { Store, type IStore } from '../provisioning/store.model.js';

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
    image_url: p.default_code
      ? `/products/${(p.default_code as string).replace('CAROL-', '')}.jpg`
      : null,
  };
}

const PRODUCT_FIELDS = [
  'id',
  'name',
  'default_code',
  'list_price',
  'qty_available',
  'categ_id',
  'barcode',
  'description_sale',
];

/**
 * Full rebuild of a store's Meilisearch index from its own Odoo DB.
 * Creates the index if missing, upserts all saleable products, applies synonyms.
 */
export async function fullRebuildStoreIndex(
  store: IStore,
  client: ScopedOdoo,
): Promise<number> {
  const indexName = store.meilisearch_index;
  logger.info({ storeId: store.store_id, indexName }, 'Full rebuild starting');

  await ensureIndex(indexName);

  const products = (await client.execute(
    'product.product',
    'search_read',
    [[['sale_ok', '=', true]]],
    { fields: PRODUCT_FIELDS, limit: 10000 },
  )) as Array<Record<string, unknown>>;

  const docs = products.map(odooProductToDoc);

  const BATCH_SIZE = 500;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    await upsertDocuments(indexName, docs.slice(i, i + BATCH_SIZE));
  }

  await setSynonyms(indexName, PHARMACY_SYNONYMS);
  lastSyncByStore.set(store.store_id, new Date());

  logger.info({ storeId: store.store_id, count: docs.length }, 'Full rebuild complete');
  return docs.length;
}

/** Incremental sync: push only products modified since last sync for this store. */
export async function incrementalSyncStore(
  store: IStore,
  client: ScopedOdoo,
): Promise<number> {
  const since = lastSyncByStore.get(store.store_id);
  if (!since) return fullRebuildStoreIndex(store, client);

  const sinceStr = since.toISOString().slice(0, 19).replace('T', ' ');
  const products = (await client.execute(
    'product.product',
    'search_read',
    [[
      ['sale_ok', '=', true],
      ['write_date', '>', sinceStr],
    ]],
    { fields: PRODUCT_FIELDS, limit: 1000 },
  )) as Array<Record<string, unknown>>;

  if (products.length === 0) {
    logger.debug({ storeId: store.store_id }, 'Incremental sync: no changes');
    lastSyncByStore.set(store.store_id, new Date());
    return 0;
  }

  const docs = products.map(odooProductToDoc);
  await upsertDocuments(store.meilisearch_index, docs);
  lastSyncByStore.set(store.store_id, new Date());

  logger.info({ storeId: store.store_id, count: docs.length }, 'Incremental sync complete');
  return docs.length;
}

/** Start periodic background sync across all active stores. Called once at startup. */
let syncInterval: NodeJS.Timeout | null = null;

export function startPeriodicSync(config: AppConfig, intervalMs: number = 10 * 60 * 1000) {
  if (syncInterval) return;

  async function runSync() {
    const stores = await Store.find({ status: 'active' }).lean<IStore[]>();
    for (const store of stores) {
      try {
        const client = getScopedOdoo(config, store.odoo_db);
        await incrementalSyncStore(store, client);
      } catch (err) {
        logger.error({ err, storeId: store.store_id }, 'Periodic sync failed for store');
      }
    }
  }

  // Run once after a short delay to let the app finish booting
  setTimeout(() => {
    runSync().catch((err) => logger.error({ err }, 'Initial sync failed'));
  }, 5000);

  syncInterval = setInterval(runSync, intervalMs);
  logger.info({ intervalMs }, 'Periodic catalog sync started (all active stores)');
}

export function stopPeriodicSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
