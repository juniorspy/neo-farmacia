import type { AppConfig } from '../../config/env.js';
import type { ScopedOdoo } from '../../shared/odoo-scoped.js';
import { getScopedOdoo } from '../../shared/odoo-scoped-cache.js';
import {
  ensureIndex,
  upsertDocuments,
  setSynonyms,
  waitForTask,
  type ProductDoc,
} from '../../shared/meilisearch.js';
import { logger } from '../../shared/logger.js';
import { PHARMACY_SYNONYMS } from './synonyms.seed.js';
import { Store, type IStore } from '../provisioning/store.model.js';

/**
 * Persist the sync outcome on the store doc. last_synced_at doubles as the
 * incremental "since" cursor (so restarts don't force a full rebuild) and
 * feeds the fleet health board. syncedAt is captured BEFORE the Odoo query:
 * the overlap re-syncs a few products (idempotent) instead of missing edits
 * made mid-sync.
 */
async function recordSyncResult(storeId: string, syncedAt: Date | null, error?: unknown) {
  const $set: Record<string, unknown> = {
    'catalog_sync.last_error': error
      ? error instanceof Error
        ? error.message
        : String(error)
      : null,
  };
  if (syncedAt) $set['catalog_sync.last_synced_at'] = syncedAt;
  await Store.updateOne({ store_id: storeId }, { $set }).catch((err) =>
    logger.warn({ err, storeId }, 'Failed to persist catalog_sync status'),
  );
}

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

  try {
    const startedAt = new Date();
    await ensureIndex(indexName);

    const products = (await client.execute(
      'product.product',
      'search_read',
      [[['sale_ok', '=', true]]],
      { fields: PRODUCT_FIELDS, limit: 10000 },
    )) as Array<Record<string, unknown>>;

    const docs = products.map(odooProductToDoc);

    const BATCH_SIZE = 500;
    let lastTaskUid: number | null = null;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      lastTaskUid = (await upsertDocuments(indexName, docs.slice(i, i + BATCH_SIZE))) ?? lastTaskUid;
    }

    await setSynonyms(indexName, PHARMACY_SYNONYMS);
    // Tasks run in uid order — the last upsert covers the whole batch run
    if (lastTaskUid !== null) await waitForTask(lastTaskUid);
    await recordSyncResult(store.store_id, startedAt);

    logger.info({ storeId: store.store_id, count: docs.length }, 'Full rebuild complete');
    return docs.length;
  } catch (err) {
    await recordSyncResult(store.store_id, null, err);
    throw err;
  }
}

/** Incremental sync: push only products modified since last sync for this store. */
export async function incrementalSyncStore(
  store: IStore,
  client: ScopedOdoo,
): Promise<number> {
  const since = store.catalog_sync?.last_synced_at;
  if (!since) return fullRebuildStoreIndex(store, client);

  try {
    const startedAt = new Date();
    const sinceStr = new Date(since).toISOString().slice(0, 19).replace('T', ' ');
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
      await recordSyncResult(store.store_id, startedAt);
      return 0;
    }

    const docs = products.map(odooProductToDoc);
    const taskUid = await upsertDocuments(store.meilisearch_index, docs);
    if (taskUid !== null) await waitForTask(taskUid);
    await recordSyncResult(store.store_id, startedAt);

    logger.info({ storeId: store.store_id, count: docs.length }, 'Incremental sync complete');
    return docs.length;
  } catch (err) {
    await recordSyncResult(store.store_id, null, err);
    throw err;
  }
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
