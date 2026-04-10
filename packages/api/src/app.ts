import Fastify from 'fastify';
import cors from '@fastify/cors';
import type Redis from 'ioredis';
import type { AppConfig } from './config/env.js';
import { webhookRoutes } from './modules/webhook/webhook.routes.js';
import { odooRoutes } from './modules/odoo/odoo.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { handoverRoutes } from './modules/handover/handover.routes.js';

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

  // Register routes
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

  return app;
}
