import axios from 'axios';
import { logger } from './logger.js';
import type { AppConfig } from '../config/env.js';

let uid: number | null = null;
let config: AppConfig['odoo'] | null = null;

async function jsonRpc(url: string, params: Record<string, unknown>) {
  const res = await axios.post(url, {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'call',
    params,
  });
  if (res.data.error) {
    throw new Error(JSON.stringify(res.data.error));
  }
  return res.data.result;
}

export async function initOdoo(appConfig: AppConfig) {
  config = appConfig.odoo;
  uid = await jsonRpc(`${config.url}/jsonrpc`, {
    service: 'common',
    method: 'authenticate',
    args: [config.db, config.user, config.password, {}],
  });
  logger.info({ uid }, 'Odoo authenticated');
}

export async function odooExecute(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
) {
  if (!uid || !config) throw new Error('Odoo not initialized');
  return jsonRpc(`${config.url}/jsonrpc`, {
    service: 'object',
    method: 'execute_kw',
    args: [config.db, uid, config.password, model, method, args, kwargs],
  });
}

export async function searchProducts(query: string, storeId: string, limit = 10) {
  const products = await odooExecute(
    'product.product',
    'search_read',
    [[['name', 'ilike', query], ['sale_ok', '=', true]]],
    {
      fields: ['name', 'list_price', 'qty_available', 'categ_id', 'barcode', 'tracking'],
      limit,
    },
  );
  return products;
}

export async function getProductById(productId: number) {
  const products = await odooExecute(
    'product.product',
    'read',
    [[productId]],
    {
      fields: [
        'name', 'list_price', 'qty_available', 'categ_id',
        'barcode', 'tracking', 'use_expiration_date',
      ],
    },
  );
  return products[0] || null;
}

export async function createSaleOrder(
  partnerId: number,
  lines: Array<{ productId: number; quantity: number; price: number }>,
) {
  const orderId = await odooExecute('sale.order', 'create', [{
    partner_id: partnerId,
    order_line: lines.map((l) => [0, 0, {
      product_id: l.productId,
      product_uom_qty: l.quantity,
      price_unit: l.price,
    }]),
  }]);
  logger.info({ orderId }, 'Sale order created in Odoo');
  return orderId;
}

export async function listSaleOrders(limit = 50, offset = 0, status?: string) {
  const domain: unknown[][] = [];
  if (status) {
    // Map dashboard status to Odoo state
    const stateMap: Record<string, string> = {
      pending: 'draft',
      ready: 'sale',
      dispatched: 'done',
      cancelled: 'cancel',
    };
    const odooState = stateMap[status] || status;
    domain.push(['state', '=', odooState]);
  }

  const orders = await odooExecute(
    'sale.order',
    'search_read',
    [domain],
    {
      fields: [
        'name', 'partner_id', 'date_order', 'amount_total',
        'state', 'order_line', 'create_date',
      ],
      limit,
      offset,
      order: 'create_date desc',
    },
  );
  return orders;
}

export async function getSaleOrder(orderId: number) {
  const orders = await odooExecute(
    'sale.order',
    'read',
    [[orderId]],
    {
      fields: [
        'name', 'partner_id', 'date_order', 'amount_total',
        'state', 'order_line', 'create_date', 'note',
      ],
    },
  );
  if (!orders || orders.length === 0) return null;

  const order = orders[0];

  // Fetch order lines
  if (order.order_line?.length > 0) {
    const lines = await odooExecute(
      'sale.order.line',
      'read',
      [order.order_line],
      {
        fields: [
          'product_id', 'name', 'product_uom_qty',
          'price_unit', 'price_subtotal',
        ],
      },
    );
    order.lines = lines;
  } else {
    order.lines = [];
  }

  return order;
}

export async function updateSaleOrderState(orderId: number, action: string) {
  // Odoo sale.order workflow actions
  switch (action) {
    case 'confirm':
      // draft → sale
      await odooExecute('sale.order', 'action_confirm', [[orderId]]);
      break;
    case 'done':
      // sale → done (lock)
      await odooExecute('sale.order', 'action_done', [[orderId]]);
      break;
    case 'cancel':
      // any → cancel
      await odooExecute('sale.order', 'action_cancel', [[orderId]]);
      break;
    case 'draft':
      // cancel → draft
      await odooExecute('sale.order', 'action_draft', [[orderId]]);
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
  logger.info({ orderId, action }, 'Sale order state updated');
}

export async function findOrCreatePartner(name: string, phone: string) {
  const existing = await odooExecute(
    'res.partner',
    'search_read',
    [[['phone', '=', phone]]],
    { fields: ['id', 'name', 'phone'], limit: 1 },
  );
  if (existing.length > 0) return existing[0];

  const id = await odooExecute('res.partner', 'create', [{
    name,
    phone,
    customer_rank: 1,
  }]);
  return { id, name, phone };
}
