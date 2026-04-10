import type { FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import axios from 'axios';
import { logger } from '../../shared/logger.js';
import type { AppConfig } from '../../config/env.js';
import { type EvolutionWebhookPayload, extractText, extractPhone } from '../evolution/evolution.types.js';
import { sendTyping } from '../evolution/evolution.client.js';
import { debounceMessage } from './debounce.service.js';
import { isDuplicate } from './idempotency.service.js';
import { acquireMutex, releaseMutex } from './mutex.service.js';
import { isBotActive } from '../handover/handover.service.js';
import { Message } from '../messages/message.model.js';

interface WebhookDeps {
  redis: Redis;
  config: AppConfig;
}

/**
 * Resolve store_id from Evolution instance name.
 * Instance naming: farmacia_{store_slug}
 */
function resolveStoreId(instanceName: string): string {
  // TODO: lookup from MongoDB/Redis mapping
  // For now, use instance name as store_id
  return instanceName.replace(/^farmacia_/, '');
}

export function createWebhookHandler(deps: WebhookDeps) {
  const { redis, config } = deps;

  return async function handleWebhook(request: FastifyRequest, reply: FastifyReply) {
    const payload = request.body as EvolutionWebhookPayload;

    // Respond immediately — Evolution API has timeout
    reply.status(200).send({ ok: true });

    // Only process message events
    if (payload.event !== 'messages.upsert') return;

    // Ignore own messages
    if (payload.data.key.fromMe) return;

    const text = extractText(payload.data);
    if (!text) return;

    const messageId = payload.data.key.id;
    const remoteJid = payload.data.key.remoteJid;
    const phone = extractPhone(remoteJid);
    const chatId = `whatsapp:${phone}`;
    const instanceName = payload.instance;
    const storeId = resolveStoreId(instanceName);
    const pushName = payload.data.pushName || '';

    logger.info({ storeId, chatId, messageId, text: text.substring(0, 50) }, 'Webhook received');

    // 1. Idempotency check
    if (await isDuplicate(redis, messageId)) {
      logger.warn({ messageId }, 'Duplicate message, skipping');
      return;
    }

    // 2. Send typing indicator immediately
    // TODO: get apiKey from store config
    // await sendTyping(instanceName, apiKey, remoteJid);

    // 3. Log inbound message to MongoDB
    try {
      await Message.create({
        store_id: storeId,
        chat_id: chatId,
        message_id: messageId,
        direction: 'inbound',
        text,
        sender: 'customer',
        timestamp: new Date(
          payload.data.messageTimestamp
            ? payload.data.messageTimestamp * 1000
            : Date.now(),
        ),
        meta: {
          phone,
          pushName,
          source: 'whatsapp',
          instanceName,
          messageType: payload.data.messageType || 'text',
        },
      });
    } catch (err: any) {
      if (err.code !== 11000) logger.error({ err }, 'Failed to log message');
    }

    // 4. Debounce — accumulate fast messages
    const accumulated = await debounceMessage(
      redis, storeId, chatId, text, config.debounce.windowMs,
    );
    if (!accumulated) return; // Timer was reset, another message will handle it

    // 5. Check handover — is bot active?
    if (!(await isBotActive(redis, storeId, chatId))) {
      logger.info({ storeId, chatId }, 'Manual mode, skipping bot processing');
      return;
    }

    // 6. Acquire conversation mutex
    if (!(await acquireMutex(redis, storeId, chatId, config.mutex.ttlMs))) {
      logger.warn({ storeId, chatId }, 'Mutex not acquired, another execution in progress');
      return;
    }

    // 7. Forward to n8n
    try {
      if (!config.n8n.webhookUrl) {
        logger.warn('N8N_WEBHOOK_URL not configured');
        return;
      }

      const n8nPayload = {
        text: accumulated,
        storeId,
        chatId,
        phone,
        pushName,
        instanceName,
        timestamp: Date.now(),
      };

      logger.info({ storeId, chatId }, 'Forwarding to n8n');
      const response = await axios.post(config.n8n.webhookUrl, n8nPayload, {
        timeout: 30000,
        headers: { 'X-API-Key': config.n8n.apiKey },
      });

      // 8. Check handover again at egress
      if (!(await isBotActive(redis, storeId, chatId))) {
        logger.info({ storeId, chatId }, 'Manual mode at egress, not sending reply');
        return;
      }

      // 9. Handle n8n response
      const replyText = response.data?.text || response.data?.content;
      if (replyText) {
        // Log outbound message
        await Message.create({
          store_id: storeId,
          chat_id: chatId,
          message_id: `bot_${Date.now()}`,
          direction: 'outbound',
          text: replyText,
          sender: 'bot',
          timestamp: new Date(),
          meta: { source: 'n8n', instanceName },
        });

        // TODO: Send via Evolution API (needs apiKey from store config)
        logger.info({ storeId, chatId, replyLength: replyText.length }, 'Bot reply ready');
      }
    } catch (err) {
      logger.error({ err, storeId, chatId }, 'Error in n8n pipeline');
    } finally {
      await releaseMutex(redis, storeId, chatId);
    }
  };
}
