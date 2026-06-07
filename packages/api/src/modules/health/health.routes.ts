import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import type Redis from 'ioredis';
import { Store, type IStore } from '../provisioning/store.model.js';
import { ProvisioningJob } from '../provisioning/provisioning-job.model.js';
import { requireSuperAdmin } from '../provisioning/admin.routes.js';
import { WhatsappConnection } from '../whatsapp/connection.model.js';
import { syncConnectionLiveState } from '../whatsapp/connection.service.js';
import { Message } from '../messages/message.model.js';
import { VoiceCallSession } from '../voice-calls/voice-call.model.js';
import { getIndexStats } from '../../shared/meilisearch.js';

/** Midnight today in the given IANA timezone (minute precision is fine here). */
function startOfDayInTz(tz: string): Date {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const msSinceMidnight = local.getTime() - new Date(local).setHours(0, 0, 0, 0);
  return new Date(now.getTime() - msSinceMidnight);
}

/** Live WhatsApp state per connection — refreshes against Evolution and persists drift. */
async function whatsappHealth(storeId: string) {
  const conns = await WhatsappConnection.find({ store_id: storeId }).sort({ created_at: 1 });
  const live = await Promise.all(conns.map((c) => syncConnectionLiveState(c).catch(() => c)));
  return live.map((c) => ({
    id: String(c._id),
    label: c.label,
    number: c.number,
    state: c.state,
  }));
}

/** Sync status from the store doc + live index count from Meilisearch. */
async function catalogHealth(store: IStore) {
  const base = {
    last_synced_at: store.catalog_sync?.last_synced_at ?? null,
    last_error: store.catalog_sync?.last_error ?? null,
  };
  try {
    const stats = await getIndexStats(store.meilisearch_index);
    return { ...base, documents: stats.numberOfDocuments, indexing: stats.isIndexing };
  } catch {
    return { ...base, documents: null, indexing: null };
  }
}

async function voiceToday(storeId: string, tz: string) {
  const since = startOfDayInTz(tz);
  const [total, missed] = await Promise.all([
    VoiceCallSession.countDocuments({ store_id: storeId, created_at: { $gte: since } }),
    VoiceCallSession.countDocuments({
      store_id: storeId,
      created_at: { $gte: since },
      status: 'missed',
    }),
  ]);
  return { total, missed };
}

async function buildStoreHealth(store: IStore, provisioningError: string | null) {
  const [whatsapp, catalog, lastMessage, voice] = await Promise.all([
    whatsappHealth(store.store_id),
    catalogHealth(store),
    Message.findOne({ store_id: store.store_id })
      .sort({ timestamp: -1 })
      .select('timestamp direction sender')
      .lean(),
    voiceToday(store.store_id, store.timezone),
  ]);

  return {
    store_id: store.store_id,
    name: store.name,
    status: store.status,
    whatsapp,
    catalog,
    last_message: lastMessage
      ? { timestamp: lastMessage.timestamp, direction: lastMessage.direction, sender: lastMessage.sender }
      : null,
    voice_today: voice,
    provisioning_error: provisioningError,
  };
}

export async function healthRoutes(app: FastifyInstance, opts: { redis: Redis }) {
  // Liveness probe — no auth, cheap, for Dokploy/uptime checks and deploy
  // verification (replaces the old 404→401 probe workaround).
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const mongoUp = mongoose.connection.readyState === 1;
    const redisUp = opts.redis.status === 'ready';
    const ok = mongoUp && redisUp;
    return reply.status(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      uptime_s: Math.round(process.uptime()),
      mongo: mongoUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
    });
  });

  // Fleet health board — one call returns the operational state of every
  // pharmacy: live WhatsApp state, catalog sync + index count, last message,
  // voice calls today, recent errors.
  app.get(
    '/api/v1/admin/fleet-health',
    { preHandler: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireSuperAdmin(request, reply)) return;

      const stores = await Store.find().sort({ created_at: -1 }).lean<IStore[]>();
      const failedJobs = await ProvisioningJob.find({
        store_id: { $in: stores.map((s) => s.store_id) },
        last_error: { $ne: null },
      })
        .select('store_id last_error')
        .lean();
      const errorByStore = new Map(failedJobs.map((j) => [j.store_id, j.last_error]));

      const fleet = await Promise.all(
        stores.map((s) => buildStoreHealth(s, errorByStore.get(s.store_id) ?? null)),
      );
      return { generated_at: new Date(), fleet };
    },
  );
}
