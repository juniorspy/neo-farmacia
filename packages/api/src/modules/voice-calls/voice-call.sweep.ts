import type Redis from 'ioredis';
import { logger } from '../../shared/logger.js';
import { Store } from '../provisioning/store.model.js';
import { isBotActive } from '../handover/handover.service.js';
import { sendCustomerMessage, phoneFromChatId } from '../whatsapp/outbound.service.js';
import { expireStaleRings } from './voice-call.service.js';

/**
 * Phase G (minimum): periodic sweep that expires unanswered rings → `missed`
 * and follows up with the customer over WhatsApp so the conversation never
 * dies silently. The atomic transition inside expireStaleRings guarantees
 * exactly-once follow-up per missed call.
 */

const SWEEP_INTERVAL_MS = 60_000;

let sweepInterval: NodeJS.Timeout | null = null;

async function followUpMissed(redis: Redis): Promise<void> {
  const missed = await expireStaleRings();
  for (const m of missed) {
    try {
      // A human owns the chat → they decide how to follow up.
      if (!(await isBotActive(redis, m.store_id, m.chat_id))) {
        logger.info({ ...m }, 'Missed call: chat in manual mode, skipping follow-up');
        continue;
      }
      const store = await Store.findOne({ store_id: m.store_id })
        .select('name agent_config')
        .lean<{ name: string; agent_config?: { signature?: string } } | null>();
      if (!store) continue;

      const sig = store.agent_config?.signature || `— ${store.name}`;
      const text =
        `📞 Te llamamos hace un momento pero no pudimos conectar. ` +
        `Si todavía te viene bien hablar, dime "llámame" y te marco de nuevo — ` +
        `o seguimos por aquí con gusto. ${sig}`;
      await sendCustomerMessage(
        m.store_id,
        { chatId: m.chat_id, phone: phoneFromChatId(m.chat_id) },
        text,
        'voice-missed-call',
      );
    } catch (err) {
      logger.error({ err, ...m }, 'Missed-call follow-up failed');
    }
  }
}

export function startVoiceCallSweep(redis: Redis, intervalMs: number = SWEEP_INTERVAL_MS): void {
  if (sweepInterval) return;
  sweepInterval = setInterval(() => {
    followUpMissed(redis).catch((err) => logger.error({ err }, 'Voice-call sweep tick failed'));
  }, intervalMs);
  logger.info({ intervalMs }, 'Voice-call missed-ring sweep started');
}

export function stopVoiceCallSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}
