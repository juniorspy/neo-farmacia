import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import {
  listSaleOrdersScoped,
  getSaleOrderScoped,
  updateSaleOrderStateScoped,
} from '../../shared/odoo-store-ops.js';
import { logger } from '../../shared/logger.js';
import {
  readOrderSnapshot,
  resolveOrderCustomer,
  notifyItemRejected,
  notifyDispatched,
} from './order-events.service.js';

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

export async function ordersRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const { redis, config } = opts;
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  app.get(
    '/api/v1/stores/:storeId/orders',
    {
      schema: {
        summary: 'Listar pedidos de la farmacia',
        description:
          'Auth: JWT (scoped por store). Lee sale.order de la DB Odoo de la farmacia.\n\n' +
          'Respuesta: array `{ id, name, customer, customerId, date, total, status, odooState }`. ' +
          'Status: `pending` (draft/sent) · `ready` (sale) · `dispatched` (done) · `cancelled` (cancel).',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'pending | ready | dispatched | cancelled',
            },
            limit: { type: 'integer', description: 'Default 50' },
            offset: { type: 'integer', description: 'Default 0' },
          },
        },
      },
    },
    async (request: FastifyRequest) => {
      const { status, limit, offset } = request.query as {
        status?: string;
        limit?: string;
        offset?: string;
      };
      const orders = await listSaleOrdersScoped(
        request.odoo,
        parseInt(limit || '50'),
        parseInt(offset || '0'),
        status,
      );
      return orders.map(formatOrder);
    },
  );

  app.get(
    '/api/v1/stores/:storeId/orders/:orderId',
    {
      schema: {
        summary: 'Detalle de un pedido con líneas',
        description:
          'Auth: JWT (scoped). Respuesta: pedido + `lines: [{ id, productId, name, qty, price, subtotal }]` ' +
          '+ `note`. Líneas con `qty: 0` = rechazadas (✗).',
        params: {
          type: 'object',
          properties: {
            storeId: { type: 'string' },
            orderId: { type: 'integer', description: 'sale.order id en Odoo' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = request.params as { storeId: string; orderId: string };
      const order = await getSaleOrderScoped(request.odoo, parseInt(orderId));
      if (!order) return reply.status(404).send({ error: 'Order not found' });
      return {
        ...formatOrder(order),
        lines: ((order.lines as Array<Record<string, unknown>>) || []).map((line) => ({
          id: line.id,
          productId: (line.product_id as [number, string])?.[0],
          name: (line.product_id as [number, string])?.[1] || line.name,
          qty: line.product_uom_qty,
          price: line.price_unit,
          subtotal: line.price_subtotal,
        })),
        note: order.note || null,
      };
    },
  );

  // ✗ pattern (Stage 10 M2): reject an unavailable item. Removes the line
  // from the sale.order (cancels the order if it was the only line) and
  // informs the customer — AI via n8n with context, template as fallback.
  app.post(
    '/api/v1/stores/:storeId/orders/:orderId/items/:lineId/reject',
    {
      schema: {
        summary: 'Rechazar un ítem del pedido (patrón ✗, M2)',
        description:
          'Auth: JWT (scoped). La línea queda en qty 0 (traza, no unlink); si era la última viva, ' +
          'cancela el pedido. Avisa al cliente: IA vía n8n con contexto → fallback plantilla. ' +
          'Si el chat está en handover manual NO se envía (avisa el panel).\n\n' +
          'Body opcional: `{ reason?: string }` (default `no_disponible`) — sin schema a propósito: ' +
          'el dashboard postea sin body.\n\n' +
          'Respuesta: `{ success, orderCancelled, total, notified, channel }`.',
        params: {
          type: 'object',
          properties: {
            storeId: { type: 'string' },
            orderId: { type: 'integer' },
            lineId: { type: 'integer', description: 'sale.order.line id' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId, lineId } = request.params as {
        storeId: string;
        orderId: string;
        lineId: string;
      };
      const { reason } = (request.body || {}) as { reason?: string };
      const store = request.store;
      const odoo = request.odoo;

      const before = await readOrderSnapshot(odoo, parseInt(orderId));
      if (!before) return reply.status(404).send({ error: 'Order not found' });
      if (!['draft', 'sent', 'sale'].includes(before.state)) {
        return reply
          .status(409)
          .send({ error: `order is ${before.state} — items can no longer be rejected` });
      }
      const line = before.lines.find((l) => l.id === parseInt(lineId));
      if (!line) return reply.status(404).send({ error: 'Order line not found' });
      if (line.qty <= 0) {
        return reply.status(400).send({ error: 'line already rejected' });
      }

      // qty → 0 instead of unlink: works on confirmed orders too (Odoo blocks
      // deleting lines once state=sale) and keeps the ✗ traceable on the order.
      const isLastLine = before.lines.filter((l) => l.qty > 0).length === 1;
      try {
        await odoo.execute('sale.order', 'write', [
          [before.id],
          { order_line: [[1, line.id, { product_uom_qty: 0 }]] },
        ]);
        if (isLastLine) await updateSaleOrderStateScoped(odoo, before.id, 'cancel');
      } catch (err) {
        logger.error({ err, orderId, lineId }, 'Failed to zero order line in Odoo');
        return reply.status(500).send({ error: 'Failed to update order in Odoo' });
      }

      const after = await readOrderSnapshot(odoo, before.id);
      const customer = await resolveOrderCustomer(odoo, store.store_id, before.partnerId);
      const notify = await notifyItemRejected(redis, config, store, customer, {
        event: isLastLine ? 'order.cancelled_no_stock' : 'order.item_rejected',
        order: {
          id: before.id,
          name: before.name,
          total: after?.total ?? 0,
          items: after?.items || [],
        },
        rejected: { name: line.name, qty: line.qty, reason: reason || 'no_disponible' },
      });

      logger.info(
        {
          storeId: store.store_id,
          orderId: before.id,
          line: line.name,
          orderCancelled: isLastLine,
          ...notify,
        },
        'Order item rejected (✗)',
      );
      return {
        success: true,
        orderCancelled: isLastLine,
        total: after?.total ?? 0,
        ...notify,
      };
    },
  );

  // Dispatch (Stage 10 M2): "despachado" = the order already went through the
  // pharmacy's own register (rule #12 — our pedido is the order, their POS
  // invoice is the sale). Confirms/locks in Odoo + notifies the customer.
  app.post(
    '/api/v1/stores/:storeId/orders/:orderId/dispatch',
    {
      schema: {
        summary: 'Despachar pedido (M2) — confirma y bloquea en Odoo + avisa al cliente',
        description:
          'Auth: JWT (scoped). "Despachado" = ya pasó por la caja de la farmacia (regla #12: ' +
          'la factura del POS es la venta fiscal, no nuestro pedido). Sin body.\n\n' +
          'Respuesta: `{ success, notified, channel }`.',
        params: {
          type: 'object',
          properties: {
            storeId: { type: 'string' },
            orderId: { type: 'integer' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = request.params as { storeId: string; orderId: string };
      const store = request.store;
      const odoo = request.odoo;

      const order = await readOrderSnapshot(odoo, parseInt(orderId));
      if (!order) return reply.status(404).send({ error: 'Order not found' });
      if (order.state === 'cancel') {
        return reply.status(409).send({ error: 'order is cancelled' });
      }

      try {
        if (['draft', 'sent'].includes(order.state)) {
          await updateSaleOrderStateScoped(odoo, order.id, 'confirm');
        }
        if (order.state !== 'done') {
          await updateSaleOrderStateScoped(odoo, order.id, 'done');
        }
      } catch (err) {
        logger.error({ err, orderId }, 'Failed to dispatch order in Odoo');
        return reply.status(500).send({ error: 'Failed to dispatch order in Odoo' });
      }

      const customer = await resolveOrderCustomer(odoo, store.store_id, order.partnerId);
      const notify = await notifyDispatched(store, customer, {
        name: order.name,
        total: order.total,
      });

      logger.info(
        { storeId: store.store_id, orderId: order.id, ...notify },
        'Order dispatched',
      );
      return { success: true, ...notify };
    },
  );

  app.patch(
    '/api/v1/stores/:storeId/orders/:orderId/status',
    {
      schema: {
        summary: 'Cambiar estado del pedido (genérico)',
        description:
          'Auth: JWT (scoped). Mapea estado dashboard → acción Odoo: ready→confirm, ' +
          'dispatched→done, cancelled→cancel, pending→draft.\n\n' +
          'Respuesta: `{ success, orderId, status }`.',
        params: {
          type: 'object',
          properties: {
            storeId: { type: 'string' },
            orderId: { type: 'integer' },
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', description: 'pending | ready | dispatched | cancelled' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { orderId } = request.params as { storeId: string; orderId: string };
      const { status } = request.body as { status: string };
      if (!status) return reply.status(400).send({ error: 'status required' });
      const validStatuses = ['pending', 'ready', 'dispatched', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return reply
          .status(400)
          .send({ error: `status must be one of: ${validStatuses.join(', ')}` });
      }
      const action = mapDashboardAction(status);
      try {
        await updateSaleOrderStateScoped(request.odoo, parseInt(orderId), action);
      } catch (err) {
        logger.error({ err, orderId, status }, 'Failed to update order status');
        return reply.status(500).send({ error: 'Failed to update order status in Odoo' });
      }
      return { success: true, orderId: parseInt(orderId), status };
    },
  );
}
