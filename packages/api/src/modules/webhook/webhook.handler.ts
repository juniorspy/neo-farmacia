import type { FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import axios from 'axios';
import { logger } from '../../shared/logger.js';
import type { AppConfig } from '../../config/env.js';
import {
  type EvolutionWebhookPayload,
  extractText,
  extractPhone,
} from '../evolution/evolution.types.js';
import { sendText } from '../evolution/evolution.client.js';
import { debounceMessage } from './debounce.service.js';
import { isDuplicate } from './idempotency.service.js';
import { acquireMutex, releaseMutex } from './mutex.service.js';
import { isBotActive } from '../handover/handover.service.js';
import { Message } from '../messages/message.model.js';
import { resolveStoreByInstance } from './store-resolver.js';

interface WebhookDeps {
  redis: Redis;
  config: AppConfig;
}

export function createWebhookHandler(deps: WebhookDeps) {
  const { redis, config } = deps;

  return async function handleWebhook(request: FastifyRequest, reply: FastifyReply) {
    const payload = request.body as EvolutionWebhookPayload;

    // Respond immediately — Evolution API has timeout
    reply.status(200).send({ ok: true });

    if (payload.event !== 'messages.upsert') return;
    if (payload.data.key.fromMe) return;

    const text = extractText(payload.data);
    if (!text) return;

    const messageId = payload.data.key.id;
    const remoteJid = payload.data.key.remoteJid;
    const phone = extractPhone(remoteJid);
    const chatId = `whatsapp:${phone}`;
    const instanceName = payload.instance;
    const pushName = payload.data.pushName || '';

    // Resolve which pharmacy this message belongs to via the Evolution instance
    const store = await resolveStoreByInstance(instanceName);
    if (!store) {
      logger.warn(
        { instanceName, messageId },
        'Unknown Evolution instance — no store mapped, dropping message',
      );
      return;
    }
    const storeId = store.store_id;

    logger.info(
      { storeId, chatId, messageId, text: text.substring(0, 50) },
      'Webhook received',
    );

    // 1. Idempotency check
    if (await isDuplicate(redis, messageId)) {
      logger.warn({ messageId }, 'Duplicate message, skipping');
      return;
    }

    // 2. TODO: Send typing indicator via Evolution (needs per-store apiKey)

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
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code !== 11000) logger.error({ err }, 'Failed to log message');
    }

    // 4. Debounce — accumulate fast messages
    const accumulated = await debounceMessage(
      redis,
      storeId,
      chatId,
      text,
      config.debounce.windowMs,
    );
    if (!accumulated) return;

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

    // 7. Forward to n8n — with store config injected so the agent can
    //    customize its persona/greeting without hardcoding per-tenant prompts.
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
        // Per-store agent config. n8n agents read these to personalize replies
        // without owning the prompt templates themselves.
        store_config: {
          store_id: storeId,
          name: store.name,
          currency: store.currency,
          timezone: store.timezone,
          lang: store.lang,
          agent: {
            name: store.agent_config?.agent_name || 'Sofía',
            greeting_style: store.agent_config?.greeting_style || 'amigable',
            signature: store.agent_config?.signature || `— ${store.name}`,
            business_hours: store.agent_config?.business_hours || '',
            delivery_info: store.agent_config?.delivery_info || '',
            custom_notes: store.agent_config?.custom_notes || '',
          },
        },
      };

      logger.info({ storeId, chatId }, 'Forwarding to n8n');
      const response = await axios.post(config.n8n.webhookUrl, n8nPayload, {
        timeout: 30000,
        headers: { 'X-API-Key': config.n8n.apiKey },
      });

      // 8. Egress handover check (might have flipped to manual mid-call)
      if (!(await isBotActive(redis, storeId, chatId))) {
        logger.info({ storeId, chatId }, 'Manual mode at egress, not sending reply');
        return;
      }

      // 9. Handle n8n response — actually send it via Evolution
      const replyText = response.data?.text || response.data?.content;
      if (replyText) {
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

        const instanceApiKey = store.whatsapp_instance_api_key;
        if (!instanceApiKey) {
          logger.warn(
            { storeId, instanceName },
            'No whatsapp_instance_api_key on store — cannot send reply',
          );
        } else {
          try {
            await sendText(instanceName, instanceApiKey, remoteJid, replyText);
            logger.info(
              { storeId, chatId, replyLength: replyText.length },
              'Bot reply sent via Evolution',
            );
          } catch (err) {
            logger.error({ err, storeId, chatId }, 'Failed to send reply via Evolution');
          }
        }
      }
    } catch (err) {
      logger.error({ err, storeId, chatId }, 'Error in n8n pipeline');
    } finally {
      await releaseMutex(redis, storeId, chatId);
    }
  };
}
