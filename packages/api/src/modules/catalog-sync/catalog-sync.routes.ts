import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { fullRebuildStoreIndex, incrementalSyncStore } from './catalog-sync.service.js';
import { setSynonyms, getSynonyms } from '../../shared/meilisearch.js';
import { logger } from '../../shared/logger.js';

export async function catalogSyncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  // POST /api/v1/stores/:storeId/catalog/resync — full rebuild
  app.post(
    '/api/v1/stores/:storeId/catalog/resync',
    {
      schema: {
        summary: 'Full rebuild del índice Meilisearch desde la DB Odoo de la farmacia',
        description:
          'Auth: JWT (scoped). Crea el índice si falta, sube todos los productos vendibles, ' +
          'aplica sinónimos y ESPERA la task de Meili (un fallo de indexado = error, no éxito silencioso). ' +
          'Sin body.\n\nRespuesta: `{ ok, storeId, count, mode: "full" }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const count = await fullRebuildStoreIndex(request.store, request.odoo);
        return { ok: true, storeId: request.store.store_id, count, mode: 'full' };
      } catch (err) {
        logger.error({ err, storeId: request.store.store_id }, 'Full resync failed');
        return reply.status(500).send({ ok: false, error: 'resync failed' });
      }
    },
  );

  // POST /api/v1/stores/:storeId/catalog/sync — incremental
  app.post(
    '/api/v1/stores/:storeId/catalog/sync',
    {
      schema: {
        summary: 'Sync incremental (productos modificados desde el último sync)',
        description:
          'Auth: JWT (scoped). Cursor persistido en `Store.catalog_sync.last_synced_at`; ' +
          'sin cursor hace full rebuild. Sin body.\n\n' +
          'Respuesta: `{ ok, storeId, count, mode: "incremental" }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const count = await incrementalSyncStore(request.store, request.odoo);
        return { ok: true, storeId: request.store.store_id, count, mode: 'incremental' };
      } catch (err) {
        logger.error({ err, storeId: request.store.store_id }, 'Incremental sync failed');
        return reply.status(500).send({ ok: false, error: 'sync failed' });
      }
    },
  );

  // GET /api/v1/stores/:storeId/catalog/synonyms
  app.get(
    '/api/v1/stores/:storeId/catalog/synonyms',
    {
      schema: {
        summary: 'Sinónimos de búsqueda del índice de la farmacia',
        description:
          'Auth: JWT (scoped). Respuesta: `{ storeId, synonyms: { termino: [variantes] } }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest) => {
      const synonyms = await getSynonyms(request.store.meilisearch_index);
      return { storeId: request.store.store_id, synonyms };
    },
  );

  // PUT /api/v1/stores/:storeId/catalog/synonyms — replaces all
  app.put(
    '/api/v1/stores/:storeId/catalog/synonyms',
    {
      schema: {
        summary: 'Reemplazar TODOS los sinónimos del índice',
        description:
          'Auth: JWT (scoped). Reemplazo completo, no merge.\n\n' +
          'Respuesta: `{ ok, storeId, count }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['synonyms'],
          properties: {
            synonyms: {
              type: 'object',
              additionalProperties: { type: 'array', items: { type: 'string' } },
              description: 'Mapa término → variantes',
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { synonyms?: Record<string, string[]> };
      if (!body.synonyms || typeof body.synonyms !== 'object') {
        return reply.status(400).send({ error: 'synonyms object required' });
      }
      await setSynonyms(request.store.meilisearch_index, body.synonyms);
      return { ok: true, storeId: request.store.store_id, count: Object.keys(body.synonyms).length };
    },
  );
}
