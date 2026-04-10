import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Message } from '../messages/message.model.js';
import { User } from '../users/user.model.js';
import { listSaleOrders } from '../../shared/odoo.js';

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/stores/:storeId/stats/summary
  app.get('/api/v1/stores/:storeId/stats/summary', async (request: FastifyRequest) => {
    const { storeId } = request.params as { storeId: string };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalCustomers, todayMessages, orders] = await Promise.all([
      User.countDocuments({ store_id: storeId }),
      Message.countDocuments({ store_id: storeId, timestamp: { $gte: today } }),
      listSaleOrders(1000, 0),
    ]);

    const totalOrders = orders.length;
    const pendingOrders = orders.filter((o: Record<string, unknown>) => o.state === 'draft' || o.state === 'sent').length;
    const completedOrders = orders.filter((o: Record<string, unknown>) => o.state === 'sale' || o.state === 'done').length;
    const totalRevenue = orders.reduce((sum: number, o: Record<string, unknown>) => sum + ((o.amount_total as number) || 0), 0);
    const avgPerOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue,
      avgPerOrder,
      totalCustomers,
      todayMessages,
    };
  });

  // GET /api/v1/stores/:storeId/stats/agent
  app.get('/api/v1/stores/:storeId/stats/agent', async (request: FastifyRequest) => {
    const { storeId } = request.params as { storeId: string };

    const [botMessages, agentMessages, totalMessages] = await Promise.all([
      Message.countDocuments({ store_id: storeId, sender: 'bot', direction: 'outbound' }),
      Message.countDocuments({ store_id: storeId, sender: 'agent', direction: 'outbound' }),
      Message.countDocuments({ store_id: storeId, direction: 'outbound' }),
    ]);

    const botPct = totalMessages > 0 ? Math.round((botMessages / totalMessages) * 100) : 0;
    const agentPct = totalMessages > 0 ? Math.round((agentMessages / totalMessages) * 100) : 0;

    return {
      botMessages,
      agentMessages,
      totalMessages,
      botPct,
      agentPct,
    };
  });
}
