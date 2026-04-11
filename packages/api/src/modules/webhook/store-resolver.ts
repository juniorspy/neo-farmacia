import { Store, type IStore } from '../provisioning/store.model.js';
import { WhatsappConnection, type IWhatsappConnection } from '../whatsapp/connection.model.js';
import { logger } from '../../shared/logger.js';

/**
 * Resolve the Store + Connection that owns a given Evolution instance name.
 * Results are cached in-process for CACHE_TTL_MS to avoid hitting Mongo
 * on every WhatsApp message. Cache is invalidated via
 * invalidateStoreResolverCache() when a connection is created/deleted/updated.
 */

const CACHE_TTL_MS = 60 * 1000; // 60s

export interface ResolvedInstance {
  store: IStore;
  connection: IWhatsappConnection;
}

interface CacheEntry {
  resolved: ResolvedInstance | null;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function resolveStoreByInstance(
  instanceName: string,
): Promise<ResolvedInstance | null> {
  const now = Date.now();
  const cached = cache.get(instanceName);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.resolved;
  }

  const connection = await WhatsappConnection.findOne({
    instance_name: instanceName,
  }).lean<IWhatsappConnection>();

  if (!connection) {
    cache.set(instanceName, { resolved: null, cachedAt: now });
    logger.warn({ instanceName }, 'resolveStoreByInstance: no connection for instance');
    return null;
  }

  const store = await Store.findOne({
    store_id: connection.store_id,
    status: 'active',
  }).lean<IStore>();

  if (!store) {
    cache.set(instanceName, { resolved: null, cachedAt: now });
    logger.warn(
      { instanceName, storeId: connection.store_id },
      'resolveStoreByInstance: connection maps to non-active store',
    );
    return null;
  }

  const resolved: ResolvedInstance = { store, connection };
  cache.set(instanceName, { resolved, cachedAt: now });
  return resolved;
}

export function invalidateStoreResolverCache(instanceName?: string): void {
  if (instanceName) {
    cache.delete(instanceName);
  } else {
    cache.clear();
  }
}
