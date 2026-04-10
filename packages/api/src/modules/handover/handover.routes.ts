import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import { getSessionMode, setSessionMode, type SessionMode } from './handover.service.js';
import { logger } from '../../shared/logger.js';

export async function handoverRoutes(
  app: FastifyInstance,
  opts: { redis: Redis },
) {
  const { redis } = opts;

  // Get session mode
  app.get('/api/v1/stores/:storeId/chats/:chatId/mode', async (request: FastifyRequest) => {
    const { storeId, chatId } = request.params as { storeId: string; chatId: string };
    const mode = await getSessionMode(redis, storeId, chatId);
    return { storeId, chatId, mode };
  });

  // Set session mode (bot or manual)
  app.put('/api/v1/stores/:storeId/chats/:chatId/mode', async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId, chatId } = request.params as { storeId: string; chatId: string };
    const { mode } = request.body as { mode: SessionMode };

    if (mode !== 'bot' && mode !== 'manual') {
      return reply.status(400).send({ error: 'mode must be "bot" or "manual"' });
    }

    await setSessionMode(redis, storeId, chatId, mode);
    logger.info({ storeId, chatId, mode }, 'Session mode changed');
    return { storeId, chatId, mode };
  });
}
