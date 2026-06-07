import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
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
import { healthRoutes } from './modules/health/health.routes.js';
import { registerStoreContext } from './modules/store-context/store-context.plugin.js';
import { storesRoutes } from './modules/stores/stores.routes.js';
import { voiceCallRoutes } from './modules/voice-calls/voice-call.routes.js';

// Tag de OpenAPI por prefijo de URL — agrupa /docs sin anotar cada ruta.
// Orden importa: el primer patrón que matchea gana.
const TAG_BY_PREFIX: Array<[RegExp, string]> = [
  [/^\/health$|^\/api\/v1\/admin\/fleet-health/, 'Health'],
  [/^\/webhook/, 'Webhook (Evolution)'],
  [/^\/api\/v1\/auth/, 'Auth'],
  [/^\/api\/v1\/admin/, 'Admin — provisioning'],
  [/^\/api\/v1\/stores\/[^/]+\/whatsapp/, 'WhatsApp'],
  [/^\/api\/v1\/stores\/[^/]+\/orders/, 'Pedidos'],
  [/^\/api\/v1\/stores\/[^/]+\/chats/, 'Chats & handover'],
  [/^\/api\/v1\/stores\/[^/]+\/products/, 'Productos'],
  [/^\/api\/v1\/stores\/[^/]+\/customers/, 'Clientes'],
  [/^\/api\/v1\/stores\/[^/]+\/stats/, 'Stats'],
  [/^\/api\/v1\/stores\/[^/]+\/catalog/, 'Catálogo (Meilisearch)'],
  [/^\/api\/v1\/stores/, 'Stores — config'],
  [/^\/api\/v1\/voice/, 'Voz'],
  [/^\/api\/v1\/(commands|products|orders|users)/, 'n8n callbacks'],
];

function tagForUrl(url: string): string {
  const match = TAG_BY_PREFIX.find(([re]) => re.test(url));
  return match ? match[1] : 'Otros';
}

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

  // @fastify/cors defaults to methods: 'GET,HEAD,POST' — which silently blocks
  // DELETE (disconnect) and PATCH (agent config) at the CORS preflight. Declare
  // every method the dashboard actually uses.
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // OpenAPI live docs at /docs. Routes need no schema to appear (method +
  // path + tag, grouped by URL prefix below); request/response examples show
  // up as routes gain `schema` declarations. Must register BEFORE the routes.
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Neo Farmacia API',
        description:
          'Microservicio central: webhook WhatsApp, callbacks n8n, dashboard por farmacia (scoped por store_id), provisioning super-admin y llamadas de voz.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT del dashboard (POST /api/v1/auth/login). Las rutas n8n usan bearer con N8N_API_KEY.',
          },
        },
      },
    },
    transform: ({ schema, url }) => {
      const s = (schema || {}) as Record<string, unknown>;
      if (url.includes('/dev/')) s.hide = true; // seeds y utilidades dev fuera de /docs
      if (!s.tags) s.tags = [tagForUrl(url)];
      return { schema: s as typeof schema, url };
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

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
    await ordersRoutes(instance, { redis, config });
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
    await whatsappRoutes(instance, { config });
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

  // Health: public liveness probe + super-admin fleet board
  await app.register(async (instance) => {
    await healthRoutes(instance, { redis });
  });

  // Per-store config (agent persona, etc.) — scoped by resolveStore
  await app.register(async (instance) => {
    await storesRoutes(instance);
  });

  // Voice calls — customer surface authed by one-time signed-link token (public)
  await app.register(async (instance) => {
    await voiceCallRoutes(instance, { redis, config });
  });

  return app;
}
