import { logger } from '../../shared/logger.js';
import { Message } from '../messages/message.model.js';
import { WhatsappConnection } from './connection.model.js';
import { sendText } from '../evolution/evolution.client.js';

/**
 * Outbound WhatsApp messages initiated by the platform (not by the chat
 * pipeline): order notices (✗/dispatch), voice-call invites, missed-call
 * follow-ups. Resolves the store's open connection, sends via Evolution and
 * persists the message on the chat so it shows in the dashboard.
 */

export interface OutboundCustomer {
  chatId: string;
  phone: string;
}

/** Pick the store's most recently connected open WhatsApp line. */
async function getOpenConnection(storeId: string) {
  return WhatsappConnection.findOne({
    store_id: storeId,
    state: 'open',
    instance_api_key: { $ne: null },
  })
    .sort({ connected_at: -1 })
    .lean();
}

export async function sendCustomerMessage(
  storeId: string,
  customer: OutboundCustomer,
  text: string,
  source: string,
): Promise<boolean> {
  const connection = await getOpenConnection(storeId);
  if (!connection) {
    logger.warn({ storeId }, 'No open WhatsApp connection — cannot send outbound message');
    return false;
  }
  try {
    await sendText(connection.instance_name, connection.instance_api_key as string, customer.phone, text);
  } catch (err) {
    logger.error({ err, storeId, chatId: customer.chatId, source }, 'Failed to send outbound message');
    return false;
  }
  await Message.create({
    store_id: storeId,
    chat_id: customer.chatId,
    message_id: `out_${source}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    direction: 'outbound',
    text,
    sender: 'bot',
    timestamp: new Date(),
    meta: { source, instanceName: connection.instance_name, phone: customer.phone },
  });
  return true;
}

/** chat_id convention is "whatsapp:<phone>" — recover the send target. */
export function phoneFromChatId(chatId: string): string {
  return chatId.replace(/^whatsapp:/, '');
}
