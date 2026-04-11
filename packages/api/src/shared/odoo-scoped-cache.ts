import { ScopedOdoo } from './odoo-scoped.js';
import type { AppConfig } from '../config/env.js';

/**
 * Process-level cache of authenticated ScopedOdoo clients, keyed by
 * url + db + user. Avoids re-authenticating on every request. Entries
 * are never evicted in this simple form — fine for low tenant counts.
 * When we shard Odoo across multiple hosts, this still works because
 * the url is part of the key.
 */
const clientCache = new Map<string, ScopedOdoo>();

function cacheKey(url: string, db: string, user: string): string {
  return `${url}::${db}::${user}`;
}

export function getScopedOdoo(
  config: AppConfig,
  db: string,
  user?: string,
  password?: string,
): ScopedOdoo {
  const login = user || config.odoo.user;
  const pw = password || config.odoo.password;
  const key = cacheKey(config.odoo.url, db, login);
  let client = clientCache.get(key);
  if (!client) {
    client = new ScopedOdoo({
      url: config.odoo.url,
      db,
      user: login,
      password: pw,
    });
    clientCache.set(key, client);
  }
  return client;
}

export function invalidateScopedOdoo(db: string): void {
  for (const key of clientCache.keys()) {
    if (key.includes(`::${db}::`)) {
      clientCache.delete(key);
    }
  }
}
