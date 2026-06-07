import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { getSessionMode, setSessionMode, type SessionMode } from './handover.service.js';
import { logger } from '../../shared/logger.js';
import { n8nBearerOk } from '../../shared/n8n-auth.js';

export async function handoverRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const { redis, config } = opts;

  // Dual auth: dashboard JWT OR n8n bearer (both arrive as Authorization:
  // Bearer). Anonymous access would let anyone silence the bot per chat.
  async function authorized(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    try {
      await request.jwtVerify();
      return true;
    } catch {
      /* not a dashboard JWT — try the n8n key */
    }
    if (n8nBearerOk(request.headers.authorization, config.n8n.apiKey)) return true;
    if (!config.n8n.apiKey && config.nodeEnv !== 'production') return true; // dev sin key
    reply.status(401).send({ error: 'unauthorized' });
    return false;
  }

  // Get session mode
  app.get('/api/v1/stores/:storeId/chats/:chatId/mode', {
    schema: {
      summary: 'Modo de sesión del chat (handover)',
      description:
        'Auth: JWT del dashboard O `Bearer N8N_API_KEY`. `bot` = responde la IA; ' +
        '`manual` = el humano tomó el chat (el bot calla en ingreso y egreso).\n\n' +
        'Respuesta: `{ storeId, chatId, mode }`.',
      params: {
        type: 'object',
        properties: {
          storeId: { type: 'string' },
          chatId: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await authorized(request, reply))) return;
    const { storeId, chatId } = request.params as { storeId: string; chatId: string };
    const mode = await getSessionMode(redis, storeId, chatId);
    return { storeId, chatId, mode };
  });

  // Set session mode (bot or manual)
  app.put('/api/v1/stores/:storeId/chats/:chatId/mode', {
    schema: {
      summary: 'Cambiar modo de sesión (bot ↔ manual)',
      description:
        'Auth: JWT del dashboard O `Bearer N8N_API_KEY`. Persistido en Redis.\n\n' +
        'Respuesta: `{ storeId, chatId, mode }`.',
      params: {
        type: 'object',
        properties: {
          storeId: { type: 'string' },
          chatId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['mode'],
        properties: {
          mode: { type: 'string', enum: ['bot', 'manual'] },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await authorized(request, reply))) return;
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
