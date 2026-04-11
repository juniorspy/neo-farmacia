import { Store, type IStore } from '../provisioning/store.model.js';
import { logger } from '../../shared/logger.js';

/**
 * Resolve the Store that owns a given Evolution instance name.
 * Results are cached in-process for CACHE_TTL_MS to avoid hitting Mongo
 * on every WhatsApp message. Cache is invalidated on any change via
 * invalidateStoreResolverCache() — call it when a Store's
 * whatsapp_instance_id changes or the store is deleted.
 */

const CACHE_TTL_MS = 60 * 1000; // 60s

interface CacheEntry {
  store: IStore | null;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function resolveStoreByInstance(
  instanceName: string,
): Promise<IStore | null> {
  const now = Date.now();
  const cached = cache.get(instanceName);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.store;
  }

  const store = await Store.findOne({
    whatsapp_instance_id: instanceName,
    status: 'active',
  }).lean<IStore>();

  cache.set(instanceName, { store, cachedAt: now });
  if (!store) {
    logger.warn({ instanceName }, 'resolveStoreByInstance: no active store for instance');
  }
  return store;
}

export function invalidateStoreResolverCache(instanceName?: string): void {
  if (instanceName) {
    cache.delete(instanceName);
  } else {
    cache.clear();
  }
}
