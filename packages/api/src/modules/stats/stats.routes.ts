import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Message } from '../messages/message.model.js';
import { User } from '../users/user.model.js';
import { listSaleOrdersScoped } from '../../shared/odoo-store-ops.js';

// Map Odoo state to dashboard status
function mapState(state: string): string {
  const map: Record<string, string> = { draft: 'pending', sent: 'pending', sale: 'ready', done: 'dispatched', cancel: 'cancelled' };
  return map[state] || state;
}

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  // GET /api/v1/stores/:storeId/stats/summary
  app.get('/api/v1/stores/:storeId/stats/summary', async (request: FastifyRequest) => {
    const { storeId } = request.params as { storeId: string };
    const { range } = request.query as { range?: string };

    const now = new Date();
    let rangeStart = new Date(now);

    switch (range) {
      case 'today':
        rangeStart.setHours(0, 0, 0, 0);
        break;
      case 'week':
        rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay() + 1);
        rangeStart.setHours(0, 0, 0, 0);
        break;
      case 'year':
        rangeStart = new Date(now.getFullYear(), 0, 1);
        break;
      case 'month':
      default:
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const [totalCustomers, periodMessages, allOrders] = await Promise.all([
      User.countDocuments({ store_id: storeId }),
      Message.countDocuments({ store_id: storeId, timestamp: { $gte: rangeStart } }),
      listSaleOrdersScoped(request.odoo, 1000, 0),
    ]);

    const orders = allOrders.filter((o: Record<string, unknown>) => {
      const dateStr = (o.date_order || o.create_date) as string;
      return new Date(dateStr) >= rangeStart;
    });

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
      periodMessages,
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

  // GET /api/v1/stores/:storeId/stats/charts — all chart data in one call
  app.get('/api/v1/stores/:storeId/stats/charts', async (request: FastifyRequest) => {
    const { storeId } = request.params as { storeId: string };
    const { range } = request.query as { range?: string };

    const allOrders = (await listSaleOrdersScoped(request.odoo, 1000, 0)) as Array<Record<string, unknown>>;

    // ── Date range filter ──
    const now = new Date();
    let rangeStart = new Date(now);

    switch (range) {
      case 'today':
        rangeStart.setHours(0, 0, 0, 0);
        break;
      case 'week':
        rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay() + 1); // Monday
        rangeStart.setHours(0, 0, 0, 0);
        break;
      case 'year':
        rangeStart = new Date(now.getFullYear(), 0, 1);
        break;
      case 'month':
      default:
        rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const orders = allOrders.filter((o) => {
      const dateStr = (o.date_order || o.create_date) as string;
      return new Date(dateStr) >= rangeStart;
    });

    // ── Sales by day ──
    // For "today": show hours instead; for others: show days in range
    const daysInRange = Math.max(1, Math.ceil((now.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)));
    const chartDays = Math.min(daysInRange, 31); // max 31 days on chart

    const dayLabels: string[] = [];
    const dailySalesMap: Record<string, number> = {};
    const chartStart = new Date(now);
    chartStart.setDate(chartStart.getDate() - chartDays + 1);
    chartStart.setHours(0, 0, 0, 0);

    for (let i = 0; i < chartDays; i++) {
      const d = new Date(chartStart);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
      dayLabels.push(label);
      dailySalesMap[key] = 0;
    }

    // ── Weekday sales ──
    const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weekdaySales = [0, 0, 0, 0, 0, 0, 0];

    // ── Orders by status ──
    const statusCounts: Record<string, number> = { pending: 0, ready: 0, dispatched: 0, cancelled: 0 };

    // ── Top products (from order lines) ──
    const productMap: Record<string, { name: string; qty: number; total: number }> = {};

    // ── Top customers ──
    const customerMap: Record<string, { name: string; orders: number; total: number }> = {};

    // Fetch all order lines for top products
    const allLineIds: number[] = [];
    for (const order of orders) {
      if (order.order_line && Array.isArray(order.order_line)) {
        allLineIds.push(...(order.order_line as number[]));
      }
    }

    let allLines: Array<Record<string, unknown>> = [];
    if (allLineIds.length > 0) {
      allLines = (await request.odoo.execute(
        'sale.order.line',
        'read',
        [allLineIds],
        { fields: ['product_id', 'product_uom_qty', 'price_subtotal', 'order_id'] },
      )) as Array<Record<string, unknown>>;
    }

    // Build product map from lines
    for (const line of allLines) {
      const productId = (line.product_id as [number, string])?.[0];
      const productName = (line.product_id as [number, string])?.[1] || 'Unknown';
      const key = String(productId);
      if (!productMap[key]) {
        productMap[key] = { name: productName, qty: 0, total: 0 };
      }
      productMap[key].qty += (line.product_uom_qty as number) || 0;
      productMap[key].total += (line.price_subtotal as number) || 0;
    }

    // Process orders
    for (const order of orders) {
      const dateStr = (order.date_order || order.create_date) as string;
      const date = new Date(dateStr);
      const dateKey = date.toISOString().slice(0, 10);
      const amount = (order.amount_total as number) || 0;
      const status = mapState(order.state as string);

      // Daily sales
      if (dailySalesMap[dateKey] !== undefined) {
        dailySalesMap[dateKey] += amount;
      }

      // Weekday
      weekdaySales[date.getDay()] += amount;

      // Status
      if (statusCounts[status] !== undefined) {
        statusCounts[status] += 1;
      }

      // Customers
      const customerId = String((order.partner_id as [number, string])?.[0] || 'unknown');
      const customerName = (order.partner_id as [number, string])?.[1] || 'Sin cliente';
      if (!customerMap[customerId]) {
        customerMap[customerId] = { name: customerName, orders: 0, total: 0 };
      }
      customerMap[customerId].orders += 1;
      customerMap[customerId].total += amount;
    }

    // ── Hourly activity from MongoDB messages ──
    const hourlyActivity: number[] = new Array(24).fill(0);
    const hourlyAgg = await Message.aggregate([
      { $match: { store_id: storeId, direction: 'inbound' } },
      { $group: { _id: { $hour: '$timestamp' }, count: { $sum: 1 } } },
    ]);
    for (const h of hourlyAgg) {
      hourlyActivity[h._id] = h.count;
    }

    // Format daily sales as array
    const dailySales = Object.keys(dailySalesMap).map((key, i) => ({
      date: dayLabels[i],
      value: Math.round(dailySalesMap[key]),
    }));

    // Reorder weekdays to start from Monday
    const weekdaySalesFormatted = [1, 2, 3, 4, 5, 6, 0].map((i) => ({
      day: weekdays[i],
      value: Math.round(weekdaySales[i]),
    }));

    // Top 10 products
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((p) => ({ name: p.name, qty: Math.round(p.qty), total: Math.round(p.total) }));

    // Top 10 customers
    const topCustomers = Object.values(customerMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((c) => ({ name: c.name, orders: c.orders, total: Math.round(c.total) }));

    // Orders by status
    const ordersByStatus = [
      { label: 'Pendiente', count: statusCounts.pending, color: '#f59e0b' },
      { label: 'Listo', count: statusCounts.ready, color: '#3b82f6' },
      { label: 'Despachado', count: statusCounts.dispatched, color: '#22c55e' },
      { label: 'Cancelado', count: statusCounts.cancelled, color: '#ef4444' },
    ];

    // Categories from top products
    const categoryMap: Record<string, number> = {};
    // We don't have category in order lines, so skip for now

    return {
      dailySales,
      weekdaySales: weekdaySalesFormatted,
      hourlyActivity,
      ordersByStatus,
      topProducts,
      topCustomers,
    };
  });
}
