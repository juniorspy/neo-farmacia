import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { User } from './user.model.js';
import { logger } from '../../shared/logger.js';

export async function usersRoutes(app: FastifyInstance) {
  // Lookup or create user — called by n8n
  app.post('/api/v1/users/lookup', async (request: FastifyRequest, reply: FastifyReply) => {
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
