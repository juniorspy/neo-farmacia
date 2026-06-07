import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import { Message } from '../messages/message.model.js';
import { User } from '../users/user.model.js';
import { getSessionMode } from '../handover/handover.service.js';
import { logger } from '../../shared/logger.js';
import type { AppConfig } from '../../config/env.js';

export async function chatsRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const { redis, config } = opts;

  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  // GET /api/v1/stores/:storeId/chats — active chats with last message
  app.get('/api/v1/stores/:storeId/chats', {
    schema: {
      summary: 'Chats activos con último mensaje (máx 50)',
      description:
        'Auth: JWT (scoped). Agrega mensajes por chat y enriquece con usuario + modo de sesión.\n\n' +
        'Respuesta: array `{ id, customer, phone, lastMessage, time, sender, mode }` — ' +
        '`mode`: `bot` | `manual` (handover).',
      params: {
        type: 'object',
        properties: { storeId: { type: 'string' } },
      },
    },
  }, async (request: FastifyRequest) => {
    const { storeId } = request.params as { storeId: string };

    // Aggregate: group messages by chat_id, get last message and count unread
    const chats = await Message.aggregate([
      { $match: { store_id: storeId } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$chat_id',
          lastMessage: { $first: '$text' },
          lastTime: { $first: '$timestamp' },
          lastSender: { $first: '$sender' },
          messageCount: { $sum: 1 },
        },
      },
      { $sort: { lastTime: -1 } },
      { $limit: 50 },
    ]);

    // Enrich with user info and session mode
    const enriched = await Promise.all(
      chats.map(async (chat) => {
        const user = await User.findOne({ store_id: storeId, chat_id: chat._id });
        const mode = await getSessionMode(redis, storeId, chat._id);
        return {
          id: chat._id,
          customer: user?.name || chat._id,
          phone: user?.phone || '',
          lastMessage: chat.lastMessage,
          time: chat.lastTime,
          sender: chat.lastSender,
          mode,
        };
      }),
    );

    return enriched;
  });

  // GET /api/v1/stores/:storeId/chats/:chatId/messages
  app.get('/api/v1/stores/:storeId/chats/:chatId/messages', {
    schema: {
      summary: 'Historial de mensajes de un chat (ascendente)',
      description:
        'Auth: JWT (scoped). Paginación hacia atrás con `before`.\n\n' +
        'Respuesta: array `{ id, text, sender, direction, time }` — ' +
        '`sender`: customer | bot | agent.',
      params: {
        type: 'object',
        properties: {
          storeId: { type: 'string' },
          chatId: { type: 'string', description: 'JID de WhatsApp (URL-encoded)' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Default 50' },
          before: { type: 'string', description: 'ISO date — mensajes anteriores a este instante' },
        },
      },
    },
  }, async (request: FastifyRequest) => {
    const { storeId, chatId } = request.params as { storeId: string; chatId: string };
    const { limit, before } = request.query as { limit?: string; before?: string };

    const query: Record<string, unknown> = { store_id: storeId, chat_id: chatId };
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit || '50'))
      .lean();

    return messages.reverse().map((m) => ({
      id: m.message_id,
      text: m.text,
      sender: m.sender,
      direction: m.direction,
      time: m.timestamp,
    }));
  });

  // POST /api/v1/stores/:storeId/chats/:chatId/messages — send manual message
  app.post('/api/v1/stores/:storeId/chats/:chatId/messages', {
    schema: {
      summary: 'Enviar mensaje manual (farmacéutico → cliente)',
      description:
        'Auth: JWT (scoped). Persiste el mensaje como `sender: agent`.\n\n' +
        'Respuesta: `{ id, text, sender, direction, time }`.',
      params: {
        type: 'object',
        properties: {
          storeId: { type: 'string' },
          chatId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId, chatId } = request.params as { storeId: string; chatId: string };
    const { text } = request.body as { text: string };

    if (!text) {
      return reply.status(400).send({ error: 'text required' });
    }

    // Save to MongoDB
    const message = await Message.create({
      store_id: storeId,
      chat_id: chatId,
      message_id: `agent_${Date.now()}`,
      direction: 'outbound',
      text,
      sender: 'agent',
      timestamp: new Date(),
    });

    logger.info({ storeId, chatId }, 'Manual message sent');

    return {
      id: message.message_id,
      text: message.text,
      sender: message.sender,
      direction: message.direction,
      time: message.timestamp,
    };
  });

}
