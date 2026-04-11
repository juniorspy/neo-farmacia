import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import type { ScopedOdoo } from '../../shared/odoo-scoped.js';
import { getScopedOdoo } from '../../shared/odoo-scoped-cache.js';
import { Store, type IStore } from '../provisioning/store.model.js';

/**
 * Resolves the Store for the current request and attaches it plus a scoped
 * Odoo client to the request object. Routes that deal with tenant data
 * (orders, products, stats, chats, customers) use this preHandler so every
 * downstream call is routed to the right tenant's Odoo DB.
 *
 * storeId resolution order:
 *   1. URL param :storeId
 *   2. Query ?store_id=
 *   3. Header x-store-id
 *   4. JWT user.stores[0].id (only if user has exactly one store)
 */
export function makeResolveStore(config: AppConfig) {
  return async function resolveStore(request: FastifyRequest, reply: FastifyReply) {
    const params = request.params as Record<string, string | undefined>;
    const query = request.query as Record<string, string | undefined>;
    const headers = request.headers as Record<string, string | string[] | undefined>;
    const user = request.user as
      | { id: string; email: string; role: string; stores?: Array<{ id: string }> }
      | undefined;

    let storeId: string | undefined =
      params.storeId ||
      query.store_id ||
      (typeof headers['x-store-id'] === 'string' ? (headers['x-store-id'] as string) : undefined);

    if (!storeId && user?.stores && user.stores.length === 1) {
      storeId = user.stores[0].id;
    }

    if (!storeId) {
      return reply.status(400).send({ error: 'store_id required' });
    }

    const store = await Store.findOne({ store_id: storeId }).lean<IStore>();
    if (!store) {
      return reply.status(404).send({ error: `store ${storeId} not found` });
    }

    if (store.status !== 'active') {
      return reply
        .status(409)
        .send({ error: `store ${storeId} is ${store.status}, not active` });
    }

    // Access control: non-admin users must have the store in their stores list
    if (user && user.role !== 'admin') {
      const allowed = (user.stores || []).some((s) => s.id === storeId);
      if (!allowed) {
        return reply.status(403).send({ error: 'not authorized for this store' });
      }
    }

    const client = getScopedOdoo(config, store.odoo_db);
    request.store = store;
    request.odoo = client;
  };
}

/** Register a decorator so routes can declare the preHandler via app.resolveStore */
export async function registerStoreContext(app: FastifyInstance, config: AppConfig) {
  // Decorate with undefined default — resolveStore preHandler replaces these per-request.
  app.decorateRequest('store', undefined as unknown as IStore);
  app.decorateRequest('odoo', undefined as unknown as ScopedOdoo);
  app.decorate('resolveStore', makeResolveStore(config));
}

// Type export for other modules
export type { ScopedOdoo };
