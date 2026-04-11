import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { fullRebuildStoreIndex, incrementalSyncStore } from './catalog-sync.service.js';
import { setSynonyms, getSynonyms, getStoreIndexName } from '../../shared/meilisearch.js';
import { logger } from '../../shared/logger.js';

export async function catalogSyncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // POST /api/v1/stores/:storeId/catalog/resync — full rebuild
  app.post('/api/v1/stores/:storeId/catalog/resync', async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = request.params as { storeId: string };
    try {
      const count = await fullRebuildStoreIndex(storeId);
      return { ok: true, storeId, count, mode: 'full' };
    } catch (err) {
      logger.error({ err, storeId }, 'Full resync failed');
      return reply.status(500).send({ ok: false, error: 'resync failed' });
    }
  });

  // POST /api/v1/stores/:storeId/catalog/sync — incremental
  app.post('/api/v1/stores/:storeId/catalog/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = request.params as { storeId: string };
    try {
      const count = await incrementalSyncStore(storeId);
      return { ok: true, storeId, count, mode: 'incremental' };
    } catch (err) {
      logger.error({ err, storeId }, 'Incremental sync failed');
      return reply.status(500).send({ ok: false, error: 'sync failed' });
    }
  });

  // GET /api/v1/stores/:storeId/catalog/synonyms
  app.get('/api/v1/stores/:storeId/catalog/synonyms', async (request: FastifyRequest) => {
    const { storeId } = request.params as { storeId: string };
    const indexName = getStoreIndexName(storeId);
    const synonyms = await getSynonyms(indexName);
    return { storeId, synonyms };
  });

  // PUT /api/v1/stores/:storeId/catalog/synonyms — replaces all
  app.put('/api/v1/stores/:storeId/catalog/synonyms', async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = request.params as { storeId: string };
    const body = request.body as { synonyms?: Record<string, string[]> };

    if (!body.synonyms || typeof body.synonyms !== 'object') {
      return reply.status(400).send({ error: 'synonyms object required' });
    }

    const indexName = getStoreIndexName(storeId);
    await setSynonyms(indexName, body.synonyms);
    return { ok: true, storeId, count: Object.keys(body.synonyms).length };
  });
}
