import type { FastifyInstance } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { createWebhookHandler } from './webhook.handler.js';

export async function webhookRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const handler = createWebhookHandler(opts);

  // No body schema on purpose: never reject an Evolution event at validation.
  app.post('/webhook/evolution', {
    schema: {
      summary: 'Webhook de Evolution API (eventos WhatsApp)',
      description:
        'Auth: ninguna (origen Evolution). Recibe `MESSAGES_UPSERT` y `CONNECTION_UPDATE`. ' +
        'Pipeline: resolver store por instancia → idempotencia por message id → debounce → ' +
        'mutex por conversación → handover check → log a Mongo → forward a n8n.',
    },
  }, handler);
  // GET /health lives in modules/health — real mongo/redis check, not a stub.
}
