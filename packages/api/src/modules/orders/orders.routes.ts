import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listSaleOrders, getSaleOrder, updateSaleOrderState } from '../../shared/odoo.js';
import { logger } from '../../shared/logger.js';

// Map Odoo states to dashboard statuses
function mapOdooState(state: string): string {
  const map: Record<string, string> = {
    draft: 'pending',
    sent: 'pending',
    sale: 'ready',
    done: 'dispatched',
    cancel: 'cancelled',
  };
  return map[state] || state;
}

// Map dashboard action to Odoo action
function mapDashboardAction(status: string): string {
  const map: Record<string, string> = {
    ready: 'confirm',
    dispatched: 'done',
    cancelled: 'cancel',
    pending: 'draft',
  };
  return map[status] || status;
}

function formatOrder(order: Record<string, unknown>) {
  return {
    id: order.id,
    name: order.name,
    customer: (order.partner_id as [number, string])?.[1] || 'Sin cliente',
    customerId: (order.partner_id as [number, string])?.[0] || null,
    date: order.date_order || order.create_date,
    total: order.amount_total,
    status: mapOdooState(order.state as string),
    odooState: order.state,
  };
}

export async function ordersRoutes(app: FastifyInstance) {
  // All dashboard order routes require auth
  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/stores/:storeId/orders
  app.get('/api/v1/stores/:storeId/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = request.params as { storeId: string };
    const { status, limit, offset } = request.query as {
      status?: string;
      limit?: string;
      offset?: string;
    };

    const orders = await listSaleOrders(
      parseInt(limit || '50'),
      parseInt(offset || '0'),
      status,
    );

    return orders.map(formatOrder);
  });

  // GET /api/v1/stores/:storeId/orders/:orderId
  app.get('/api/v1/stores/:storeId/orders/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { storeId: string; orderId: string };

    const order = await getSaleOrder(parseInt(orderId));
    if (!order) {
      return reply.status(404).send({ error: 'Order not found' });
    }

    return {
      ...formatOrder(order),
      lines: (order.lines || []).map((line: Record<string, unknown>) => ({
        id: line.id,
        productId: (line.product_id as [number, string])?.[0],
        name: (line.product_id as [number, string])?.[1] || line.name,
        qty: line.product_uom_qty,
        price: line.price_unit,
        subtotal: line.price_subtotal,
      })),
      note: order.note || null,
    };
  });

  // PATCH /api/v1/stores/:storeId/orders/:orderId/status
  app.patch('/api/v1/stores/:storeId/orders/:orderId/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = request.params as { storeId: string; orderId: string };
    const { status } = request.body as { status: string };

    if (!status) {
      return reply.status(400).send({ error: 'status required' });
    }

    const validStatuses = ['pending', 'ready', 'dispatched', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return reply.status(400).send({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const action = mapDashboardAction(status);

    try {
      await updateSaleOrderState(parseInt(orderId), action);
    } catch (err) {
      logger.error({ err, orderId, status }, 'Failed to update order status');
      return reply.status(500).send({ error: 'Failed to update order status in Odoo' });
    }

    return { success: true, orderId: parseInt(orderId), status };
  });
}
