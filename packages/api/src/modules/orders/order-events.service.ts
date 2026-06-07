import axios from 'axios';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import type { ScopedOdoo } from '../../shared/odoo-scoped.js';
import { logger } from '../../shared/logger.js';
import type { IStore } from '../provisioning/store.model.js';
import { User } from '../users/user.model.js';
import { Message } from '../messages/message.model.js';
import { WhatsappConnection } from '../whatsapp/connection.model.js';
import { sendText } from '../evolution/evolution.client.js';
import { isBotActive } from '../handover/handover.service.js';
import { buildAgentStoreConfig } from '../stores/store-config.payload.js';
import { getSaleOrderScoped } from '../../shared/odoo-store-ops.js';

/**
 * Order events — the ✗ dispatch pattern (Stage 10 M2, decisions D3/D4).
 *
 * When the pharmacist rejects an unavailable item or dispatches an order,
 * the customer must always be informed on the same WhatsApp conversation.
 * Primary path for ✗: n8n (the AI writes the notice with context and can
 * suggest substitutes). Fallback: plain template sent directly via Evolution
 * so the customer is never left hanging if n8n is down/unconfigured.
 */

export interface OrderItem {
  name: string;
  qty: number;
}

export interface OrderSnapshot {
  id: number;
  name: string;
  total: number;
  state: string;
  items: OrderItem[];
}

export interface OrderCustomer {
  chatId: string;
  phone: string;
  name: string;
}

/** Read the order from the store's Odoo into a plain snapshot. */
export async function readOrderSnapshot(
  odoo: ScopedOdoo,
  orderId: number,
): Promise<(OrderSnapshot & { partnerId: number | null; lines: Array<{ id: number; name: string; qty: number }> }) | null> {
  const order = await getSaleOrderScoped(odoo, orderId);
  if (!order) return null;
  const lines = ((order.lines as Array<Record<string, unknown>>) || []).map((l) => ({
    id: l.id as number,
    name: ((l.product_id as [number, string])?.[1] as string) || (l.name as string) || '',
    qty: (l.product_uom_qty as number) || 0,
  }));
  return {
    id: order.id as number,
    name: order.name as string,
    total: (order.amount_total as number) || 0,
    state: order.state as string,
    partnerId: (order.partner_id as [number, string])?.[0] || null,
    // Rejected lines stay on the order with qty 0 (trace) — exclude them
    // from the customer-facing item list.
    items: lines.filter((l) => l.qty > 0).map(({ name, qty }) => ({ name, qty })),
    lines,
  };
}

/** Resolve the WhatsApp identity of the order's customer: partner phone →
 *  User {store_id, phone} → chat_id. Returns null if the order has no
 *  WhatsApp-known customer (e.g. manually created in Odoo). */
export async function resolveOrderCustomer(
  odoo: ScopedOdoo,
  storeId: string,
  partnerId: number | null,
): Promise<OrderCustomer | null> {
  if (!partnerId) return null;
  const [partner] = (await odoo.execute('res.partner', 'read', [[partnerId]], {
    fields: ['name', 'phone'],
  })) as Array<{ name: string; phone: string | false }>;
  const phone = partner?.phone || null;
  if (!phone) return null;
  const user = await User.findOne({ store_id: storeId, phone }).lean();
  if (!user) return null;
  return { chatId: user.chat_id, phone, name: user.name || partner.name || '' };
}

/** Pick the store's active WhatsApp connection for outbound sends. */
async function getOpenConnection(storeId: string) {
  return WhatsappConnection.findOne({
    store_id: storeId,
    state: 'open',
    instance_api_key: { $ne: null },
  })
    .sort({ connected_at: -1 })
    .lean();
}

/** Send a WhatsApp message to the customer and persist it on the chat. */
export async function sendCustomerMessage(
  store: IStore,
  customer: OrderCustomer,
  text: string,
  source: string,
): Promise<boolean> {
  const connection = await getOpenConnection(store.store_id);
  if (!connection) {
    logger.warn({ storeId: store.store_id }, 'No open WhatsApp connection — cannot notify customer');
    return false;
  }
  try {
    await sendText(connection.instance_name, connection.instance_api_key as string, customer.phone, text);
  } catch (err) {
    logger.error({ err, storeId: store.store_id, chatId: customer.chatId }, 'Failed to send order notice');
    return false;
  }
  await Message.create({
    store_id: store.store_id,
    chat_id: customer.chatId,
    message_id: `order_evt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    direction: 'outbound',
    text,
    sender: 'bot',
    timestamp: new Date(),
    meta: { source, instanceName: connection.instance_name, phone: customer.phone },
  });
  return true;
}

export interface RejectEventPayload {
  event: 'order.item_rejected' | 'order.cancelled_no_stock';
  storeId: string;
  chatId: string;
  phone: string;
  customerName: string;
  order: { id: number; name: string; total: number; items: OrderItem[] };
  rejected: { name: string; qty: number; reason: string };
  store_config: ReturnType<typeof buildAgentStoreConfig>;
}

/** Ask n8n's AI to write the customer notice. Returns the text or null. */
async function askN8nForNotice(
  config: AppConfig,
  payload: RejectEventPayload,
): Promise<string | null> {
  if (!config.n8n.orderEventWebhookUrl) return null;
  try {
    const res = await axios.post(config.n8n.orderEventWebhookUrl, payload, {
      timeout: 30000,
      headers: { 'X-API-Key': config.n8n.apiKey },
    });
    const text = res.data?.text || res.data?.content || res.data?.output;
    return typeof text === 'string' && text.trim() ? text : null;
  } catch (err) {
    logger.error(
      { err, storeId: payload.storeId, event: payload.event },
      'n8n order-event webhook failed — falling back to template',
    );
    return null;
  }
}

function templateRejectNotice(
  store: IStore,
  customer: OrderCustomer,
  payload: RejectEventPayload,
): string {
  const sig = store.agent_config?.signature || `— ${store.name}`;
  const hola = customer.name ? `Hola ${customer.name.split(' ')[0]}!` : '¡Hola!';
  if (payload.event === 'order.cancelled_no_stock') {
    return (
      `${hola} Lamentablemente *${payload.rejected.name}* no está disponible en este momento ` +
      `y era el único producto de tu pedido ${payload.order.name}, así que quedó cancelado. ` +
      `Escríbenos si quieres pedir otra cosa. ${sig}`
    );
  }
  return (
    `${hola} Sobre tu pedido ${payload.order.name}: *${payload.rejected.name}* no está ` +
    `disponible en este momento, así que lo retiramos. El resto sigue en pie ` +
    `(total RD$${payload.order.total.toLocaleString('es-DO')}). ` +
    `Si quieres te buscamos un sustituto — solo dime. ${sig}`
  );
}

export interface NotifyResult {
  notified: boolean;
  via: 'n8n' | 'template' | null;
  skippedReason?: 'manual_mode' | 'no_customer' | 'send_failed';
}

/** Full ✗ notification flow: handover check → n8n (AI) → template fallback. */
export async function notifyItemRejected(
  redis: Redis,
  config: AppConfig,
  store: IStore,
  customer: OrderCustomer | null,
  payload: Omit<RejectEventPayload, 'store_config' | 'storeId' | 'chatId' | 'phone' | 'customerName'>,
): Promise<NotifyResult> {
  if (!customer) return { notified: false, via: null, skippedReason: 'no_customer' };

  // A human took over this chat — don't talk over them; the dashboard tells
  // the pharmacist to inform the customer themselves.
  if (!(await isBotActive(redis, store.store_id, customer.chatId))) {
    return { notified: false, via: null, skippedReason: 'manual_mode' };
  }

  const fullPayload: RejectEventPayload = {
    ...payload,
    storeId: store.store_id,
    chatId: customer.chatId,
    phone: customer.phone,
    customerName: customer.name,
    store_config: buildAgentStoreConfig(store),
  };

  const aiText = await askN8nForNotice(config, fullPayload);
  const text = aiText || templateRejectNotice(store, customer, fullPayload);
  const sent = await sendCustomerMessage(
    store,
    customer,
    text,
    aiText ? 'n8n-order-event' : 'order-event-template',
  );
  if (!sent) return { notified: false, via: null, skippedReason: 'send_failed' };
  return { notified: true, via: aiText ? 'n8n' : 'template' };
}

/** Dispatch notification — deterministic template, operator-triggered, so it
 *  sends regardless of handover (the human clicked the button). */
export async function notifyDispatched(
  store: IStore,
  customer: OrderCustomer | null,
  order: { name: string; total: number },
): Promise<NotifyResult> {
  if (!customer) return { notified: false, via: null, skippedReason: 'no_customer' };
  const sig = store.agent_config?.signature || `— ${store.name}`;
  const hola = customer.name ? `${customer.name.split(' ')[0]}, tu` : 'Tu';
  const text =
    `🛵 ${hola} pedido ${order.name} ya fue despachado y va en camino. ` +
    `Total: RD$${order.total.toLocaleString('es-DO')}. ¡Gracias por tu compra! ${sig}`;
  const sent = await sendCustomerMessage(store, customer, text, 'order-dispatch');
  if (!sent) return { notified: false, via: null, skippedReason: 'send_failed' };
  return { notified: true, via: 'template' };
}
