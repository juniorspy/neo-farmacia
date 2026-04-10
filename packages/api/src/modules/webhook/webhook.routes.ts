import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { createWebhookHandler } from './webhook.handler.js';

export async function webhookRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const handler = createWebhookHandler(opts);

  app.post('/webhook/evolution', handler);

  app.get('/health', async () => ({
    status: 'ok',
    service: 'neo-farmacia-api',
    timestamp: new Date().toISOString(),
  }));
}
