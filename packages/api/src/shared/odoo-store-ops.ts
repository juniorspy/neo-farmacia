import type { ScopedOdoo } from './odoo-scoped.js';
import { logger } from './logger.js';

/**
 * Store-scoped versions of the helpers in shared/odoo.ts. Each one takes
 * a ScopedOdoo client as the first argument and performs the same logical
 * operation against that tenant's Odoo database. Routes use these via
 * request.odoo (see store-context plugin).
 */

export async function searchProductsScoped(
  client: ScopedOdoo,
  query: string,
  limit = 10,
): Promise<unknown[]> {
  return (await client.execute(
    'product.product',
    'search_read',
    [[['name', 'ilike', query], ['sale_ok', '=', true]]],
    {
      fields: ['name', 'list_price', 'qty_available', 'categ_id', 'barcode', 'tracking'],
      limit,
    },
  )) as unknown[];
}

export async function getProductByIdScoped(
  client: ScopedOdoo,
  productId: number,
): Promise<Record<string, unknown> | null> {
  const products = (await client.execute('product.product', 'read', [[productId]], {
    fields: [
      'name',
      'list_price',
      'qty_available',
      'categ_id',
      'barcode',
      'tracking',
      'use_expiration_date',
    ],
  })) as Record<string, unknown>[];
  return products[0] || null;
}

export async function createSaleOrderScoped(
  client: ScopedOdoo,
  partnerId: number,
  lines: Array<{ productId: number; quantity: number; price: number }>,
): Promise<number> {
  const orderId = (await client.execute('sale.order', 'create', [
    {
      partner_id: partnerId,
      order_line: lines.map((l) => [0, 0, {
        product_id: l.productId,
        product_uom_qty: l.quantity,
        price_unit: l.price,
      }]),
    },
  ])) as number;
  logger.info({ orderId }, 'Sale order created in Odoo (scoped)');
  return orderId;
}

export async function listSaleOrdersScoped(
  client: ScopedOdoo,
  limit = 50,
  offset = 0,
  status?: string,
): Promise<Array<Record<string, unknown>>> {
  const domain: unknown[][] = [];
  if (status) {
    const stateMap: Record<string, string> = {
      pending: 'draft',
      ready: 'sale',
      dispatched: 'done',
      cancelled: 'cancel',
    };
    const odooState = stateMap[status] || status;
    domain.push(['state', '=', odooState]);
  }
  return (await client.execute('sale.order', 'search_read', [domain], {
    fields: [
      'name',
      'partner_id',
      'date_order',
      'amount_total',
      'state',
      'order_line',
      'create_date',
    ],
    limit,
    offset,
    order: 'create_date desc',
  })) as Array<Record<string, unknown>>;
}

export async function getSaleOrderScoped(
  client: ScopedOdoo,
  orderId: number,
): Promise<Record<string, unknown> | null> {
  const orders = (await client.execute('sale.order', 'read', [[orderId]], {
    fields: [
      'name',
      'partner_id',
      'date_order',
      'amount_total',
      'state',
      'order_line',
      'create_date',
      'note',
    ],
  })) as Array<Record<string, unknown>>;
  if (!orders || orders.length === 0) return null;
  const order = orders[0];
  const lineIds = order.order_line as number[] | undefined;
  if (lineIds && lineIds.length > 0) {
    const lines = (await client.execute('sale.order.line', 'read', [lineIds], {
      fields: ['product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'],
    })) as Array<Record<string, unknown>>;
    (order as Record<string, unknown>).lines = lines;
  } else {
    (order as Record<string, unknown>).lines = [];
  }
  return order;
}

export async function updateSaleOrderStateScoped(
  client: ScopedOdoo,
  orderId: number,
  action: string,
): Promise<void> {
  switch (action) {
    case 'confirm':
      await client.execute('sale.order', 'action_confirm', [[orderId]]);
      break;
    case 'done':
      await client.execute('sale.order', 'action_done', [[orderId]]);
      break;
    case 'cancel':
      await client.execute('sale.order', 'action_cancel', [[orderId]]);
      break;
    case 'draft':
      await client.execute('sale.order', 'action_draft', [[orderId]]);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
  logger.info({ orderId, action }, 'Sale order state updated (scoped)');
}

export async function findOrCreatePartnerScoped(
  client: ScopedOdoo,
  name: string,
  phone: string,
): Promise<{ id: number; name: string; phone: string }> {
  const existing = (await client.execute(
    'res.partner',
    'search_read',
    [[['phone', '=', phone]]],
    { fields: ['id', 'name', 'phone'], limit: 1 },
  )) as Array<{ id: number; name: string; phone: string }>;
  if (existing.length > 0) return existing[0];
  const id = (await client.execute('res.partner', 'create', [
    { name, phone, customer_rank: 1 },
  ])) as number;
  return { id, name, phone };
}
