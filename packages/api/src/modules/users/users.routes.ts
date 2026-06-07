import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { User } from './user.model.js';
import { logger } from '../../shared/logger.js';
import { makeN8nGuard } from '../../shared/n8n-auth.js';

export async function usersRoutes(app: FastifyInstance, opts: { config: AppConfig }) {
  const requireN8n = makeN8nGuard(opts.config);

  // Lookup or create user — called by n8n
  app.post('/api/v1/users/lookup', {
    schema: {
      summary: 'Buscar o crear usuario por chat (n8n Registration Agent)',
      description:
        'Auth: `Bearer N8N_API_KEY`. Busca por `chatId`, fallback por `phone`; crea si no existe. ' +
        'Completa name/address/phone solo si venían vacíos.\n\n' +
        'Respuesta: `{ user, isNew }`.',
      body: {
        type: 'object',
        required: ['storeId', 'chatId'],
        properties: {
          storeId: { type: 'string' },
          chatId: { type: 'string', description: 'JID de WhatsApp del cliente' },
          phone: { type: 'string' },
          name: { type: 'string' },
          address: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requireN8n(request, reply)) return;
    const { storeId, chatId, phone, name, address } = request.body as {
      storeId: string;
      chatId: string;
      phone?: string;
      name?: string;
      address?: string;
    };

    if (!storeId || !chatId) {
      return reply.status(400).send({ error: 'storeId and chatId required' });
    }

    // Try to find by chatId first
    let user = await User.findOne({ store_id: storeId, chat_id: chatId });

    // Fallback: find by phone
    if (!user && phone) {
      user = await User.findOne({ store_id: storeId, phone });
    }

    // Create if not found
    if (!user) {
      user = await User.create({
        store_id: storeId,
        chat_id: chatId,
        phone: phone || '',
        name: name || '',
        address: address || '',
        registered: false,
      });
      logger.info({ storeId, chatId }, 'New user created');
      return { user, isNew: true };
    }

    // Update if new data provided
    if (name && !user.name) user.name = name;
    if (address && !user.address) user.address = address;
    if (phone && !user.phone) user.phone = phone;
    if (user.isModified()) {
      user.updated_at = new Date();
      await user.save();
    }

    return { user, isNew: false };
  });
}
