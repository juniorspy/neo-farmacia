import { User } from '../../users/user.model.js';
import {
  findOrCreatePartnerScoped,
  createSaleOrderScoped,
  updateSaleOrderStateScoped,
} from '../../../shared/odoo-store-ops.js';
import { logger } from '../../../shared/logger.js';
import type { CommandContext, CommandResult } from '../types.js';

interface CartOp {
  op: 'add' | 'update' | 'remove';
  productoId?: number;
  sku?: string;
  nombre?: string;
  cantidad?: number;
  precio?: number;
  itemId?: number;
}

// Find or create an active draft sale order for this chat on the store's Odoo DB
async function getOrCreateActiveDraft(
  ctx: CommandContext,
): Promise<{ orderId: number; partnerId: number }> {
  const { storeId, chatId, odoo } = ctx;
  const user = await User.findOne({ store_id: storeId, chat_id: chatId });
  const name = user?.name || 'WhatsApp Customer';
  const phone = user?.phone || '';

  const partner = await findOrCreatePartnerScoped(odoo, name, phone);

  const existing = (await odoo.execute(
    'sale.order',
    'search_read',
    [[['partner_id', '=', partner.id], ['state', '=', 'draft']]],
    { fields: ['id'], limit: 1, order: 'create_date desc' },
  )) as Array<Record<string, unknown>>;

  if (existing && existing.length > 0) {
    return { orderId: existing[0].id as number, partnerId: partner.id };
  }

  const orderId = await createSaleOrderScoped(odoo, partner.id, []);
  return { orderId, partnerId: partner.id };
}

// pedido.updateItems — add/update/remove cart items
export async function pedidoUpdateItems(ctx: CommandContext): Promise<CommandResult> {
  const { chatId, odoo } = ctx;
  const payload = ctx.payload as { ops?: CartOp[]; pedidoId?: number };

  if (!chatId) return { ok: false, error: 'chatId required' };
  if (!payload.ops || payload.ops.length === 0) {
    return { ok: false, error: 'ops array required' };
  }

  let orderId = payload.pedidoId;
  if (!orderId) {
    const active = await getOrCreateActiveDraft(ctx);
    orderId = active.orderId;
  }

  for (const op of payload.ops) {
    try {
      if (op.op === 'add') {
        let productId = op.productoId;
        if (!productId && op.nombre) {
          const found = (await odoo.execute(
            'product.product',
            'search_read',
            [[['name', 'ilike', op.nombre], ['sale_ok', '=', true]]],
            { fields: ['id', 'list_price'], limit: 1 },
          )) as Array<Record<string, unknown>>;
          if (found.length > 0) {
            productId = found[0].id as number;
            if (!op.precio) op.precio = found[0].list_price as number;
          }
        }
        if (!productId) {
          logger.warn({ op }, 'Could not resolve product for add op');
          continue;
        }

        await odoo.execute('sale.order', 'write', [
          [orderId],
          {
            order_line: [[0, 0, {
              product_id: productId,
              product_uom_qty: op.cantidad || 1,
              price_unit: op.precio || 0,
            }]],
          },
        ]);
      } else if (op.op === 'update') {
        if (!op.itemId) continue;
        await odoo.execute('sale.order', 'write', [
          [orderId],
          {
            order_line: [[1, op.itemId, {
              product_uom_qty: op.cantidad,
              ...(op.precio !== undefined ? { price_unit: op.precio } : {}),
            }]],
          },
        ]);
      } else if (op.op === 'remove') {
        if (!op.itemId) continue;
        await odoo.execute('sale.order', 'write', [
          [orderId],
          { order_line: [[2, op.itemId]] },
        ]);
      }
    } catch (err) {
      logger.error({ err, op, orderId }, 'Failed to process cart op');
    }
  }

  const [order] = (await odoo.execute(
    'sale.order',
    'read',
    [[orderId]],
    { fields: ['name', 'amount_total', 'state', 'order_line'] },
  )) as Array<Record<string, unknown>>;

  const lines =
    order.order_line && (order.order_line as number[]).length > 0
      ? ((await odoo.execute(
          'sale.order.line',
          'read',
          [order.order_line],
          { fields: ['product_id', 'product_uom_qty', 'price_unit', 'price_subtotal'] },
        )) as Array<Record<string, unknown>>)
      : [];

  return {
    ok: true,
    result: {
      pedidoId: orderId,
      name: order.name,
      estado: order.state,
      totales: { items: lines.length, total: order.amount_total },
      articulos: lines.map((l) => ({
        itemId: l.id,
        productoId: (l.product_id as [number, string])?.[0],
        nombre: (l.product_id as [number, string])?.[1],
        cantidad: l.product_uom_qty,
        precio: l.price_unit,
        subtotal: l.price_subtotal,
      })),
    },
  };
}

// pedido.consultarPrecio — quick price lookup without adding to cart
export async function pedidoConsultarPrecio(ctx: CommandContext): Promise<CommandResult> {
  const { odoo } = ctx;
  const { producto, productoId } = ctx.payload as { producto?: string; productoId?: number };

  if (!producto && !productoId) {
    return { ok: false, error: 'producto or productoId required' };
  }

  let product: Record<string, unknown> | undefined;
  if (productoId) {
    const [p] = (await odoo.execute(
      'product.product',
      'read',
      [[productoId]],
      { fields: ['id', 'name', 'list_price', 'qty_available'] },
    )) as Array<Record<string, unknown>>;
    product = p;
  } else {
    const found = (await odoo.execute(
      'product.product',
      'search_read',
      [[['name', 'ilike', producto], ['sale_ok', '=', true]]],
      { fields: ['id', 'name', 'list_price', 'qty_available'], limit: 1 },
    )) as Array<Record<string, unknown>>;
    product = found[0];
  }

  if (!product) return { ok: true, result: { found: false } };

  return {
    ok: true,
    result: {
      found: true,
      productoId: product.id,
      nombre: product.name,
      precio: product.list_price,
      stock: product.qty_available,
      disponible: (product.qty_available as number) > 0,
    },
  };
}

// pedido.despachar — confirm draft → sale (ready for dispatch)
export async function pedidoDespachar(ctx: CommandContext): Promise<CommandResult> {
  const { odoo } = ctx;
  const { pedidoId } = ctx.payload as { pedidoId?: number };
  if (!pedidoId) return { ok: false, error: 'pedidoId required' };

  try {
    await updateSaleOrderStateScoped(odoo, pedidoId, 'confirm');
  } catch (err) {
    logger.error({ err, pedidoId }, 'Failed to confirm order');
    return { ok: false, error: 'Failed to confirm order in Odoo' };
  }

  return { ok: true, result: { pedidoId, estado: 'sale' } };
}

// pedido.cancel — cancel order
export async function pedidoCancel(ctx: CommandContext): Promise<CommandResult> {
  const { odoo } = ctx;
  const { pedidoId } = ctx.payload as { pedidoId?: number };
  if (!pedidoId) return { ok: false, error: 'pedidoId required' };

  try {
    await updateSaleOrderStateScoped(odoo, pedidoId, 'cancel');
  } catch (err) {
    logger.error({ err, pedidoId }, 'Failed to cancel order');
    return { ok: false, error: 'Failed to cancel order in Odoo' };
  }

  return { ok: true, result: { pedidoId, estado: 'cancel' } };
}
