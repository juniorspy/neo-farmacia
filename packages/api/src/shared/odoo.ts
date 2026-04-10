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
