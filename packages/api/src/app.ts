import Fastify from 'fastify';
import cors from '@fastify/cors';
import type Redis from 'ioredis';
import type { AppConfig } from './config/env.js';
import { registerJwt } from './modules/auth/jwt.plugin.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { webhookRoutes } from './modules/webhook/webhook.routes.js';
import { odooRoutes } from './modules/odoo/odoo.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { handoverRoutes } from './modules/handover/handover.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { chatsRoutes } from './modules/chats/chats.routes.js';
import { customersRoutes } from './modules/customers/customers.routes.js';
import { productsRoutes } from './modules/products/products.routes.js';
import { statsRoutes } from './modules/stats/stats.routes.js';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes.js';
import { commandsRoutes } from './modules/commands/commands.routes.js';
import { catalogSyncRoutes } from './modules/catalog-sync/catalog-sync.routes.js';
import { adminRoutes } from './modules/provisioning/admin.routes.js';
import { registerStoreContext } from './modules/store-context/store-context.plugin.js';
import { storesRoutes } from './modules/stores/stores.routes.js';

export async function buildApp(redis: Redis, config: AppConfig) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  await app.register(cors, { origin: true });

  // JWT plugin — must register before routes that use app.authenticate
  await registerJwt(app, config);

  // Store context — adds app.resolveStore preHandler, request.store, request.odoo
  await registerStoreContext(app, config);

  // Auth routes (login, me)
  await app.register(async (instance) => {
    await authRoutes(instance, { config });
  });

  // Public routes (webhook, n8n callbacks)
  await app.register(async (instance) => {
    await webhookRoutes(instance, { redis, config });
  });

  await app.register(async (instance) => {
    await odooRoutes(instance, { redis, config });
  });

  await app.register(async (instance) => {
    await usersRoutes(instance);
  });

  await app.register(async (instance) => {
    await handoverRoutes(instance, { redis });
  });

  // Dashboard API routes (protected)
  await app.register(async (instance) => {
    await ordersRoutes(instance);
  });

  await app.register(async (instance) => {
    await chatsRoutes(instance, { redis, config });
  });

  await app.register(async (instance) => {
    await customersRoutes(instance);
  });

  await app.register(async (instance) => {
    await productsRoutes(instance, { redis, config });
  });

  await app.register(async (instance) => {
    await statsRoutes(instance);
  });

  await app.register(async (instance) => {
    await whatsappRoutes(instance);
  });

  // n8n command router (public, bearer-auth via config.n8n.apiKey)
  await app.register(async (instance) => {
    await commandsRoutes(instance, { redis, config });
  });

  // Catalog sync endpoints (JWT protected)
  await app.register(async (instance) => {
    await catalogSyncRoutes(instance);
  });

  // Super-admin: pharmacy provisioning (JWT + role=admin)
  await app.register(async (instance) => {
    await adminRoutes(instance, { config });
  });

  // Per-store config (agent persona, etc.) — scoped by resolveStore
  await app.register(async (instance) => {
    await storesRoutes(instance);
  });

  return app;
}
