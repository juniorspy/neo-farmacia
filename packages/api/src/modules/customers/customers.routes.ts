import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { User } from '../users/user.model.js';
import { Message } from '../messages/message.model.js';

export async function customersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/stores/:storeId/customers
  app.get('/api/v1/stores/:storeId/customers', async (request: FastifyRequest) => {
    const { storeId } = request.params as { storeId: string };
    const { search } = request.query as { search?: string };

    const query: Record<string, unknown> = { store_id: storeId };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await User.find(query)
      .sort({ updated_at: -1 })
      .limit(50)
      .lean();

    return customers.map((c) => ({
      id: c._id,
      name: c.name || c.chat_id,
      phone: c.phone,
      chatId: c.chat_id,
      registered: c.registered,
      createdAt: c.created_at,
    }));
  });

  // GET /api/v1/stores/:storeId/customers/:customerId
  app.get('/api/v1/stores/:storeId/customers/:customerId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId, customerId } = request.params as { storeId: string; customerId: string };

    const customer = await User.findOne({ _id: customerId, store_id: storeId }).lean();
    if (!customer) {
      return reply.status(404).send({ error: 'Customer not found' });
    }

    // Get message count
    const messageCount = await Message.countDocuments({
      store_id: storeId,
      chat_id: customer.chat_id,
    });

    return {
      id: customer._id,
      name: customer.name || customer.chat_id,
      phone: customer.phone,
      chatId: customer.chat_id,
      address: customer.address,
      registered: customer.registered,
      messageCount,
      createdAt: customer.created_at,
    };
  });
}
