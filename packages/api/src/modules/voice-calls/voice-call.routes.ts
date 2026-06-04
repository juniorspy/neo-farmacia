import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { Store, VOICE_CONFIG_DEFAULTS } from '../provisioning/store.model.js';
import { Message } from '../messages/message.model.js';
import { User } from '../users/user.model.js';
import { inviteTokenMatches, buildCallLink } from './invite-token.js';
import { mintLiveKitToken, livekitConfigured } from './livekit-token.js';
import {
  findSession,
  transitionStatus,
  createSessionWithInvite,
  acquireCallSlot,
  extendCallSlot,
  releaseCallSlot,
  DEFAULT_INVITE_TTL_MS,
} from './voice-call.service.js';
import { VoiceCallSession, type IVoiceCallSession } from './voice-call.model.js';

/** Constant-time bearer check for the n8n create endpoint. */
function bearerOk(authHeader: string | undefined, expected: string): boolean {
  if (!authHeader || !expected) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Phase 2 — the customer call surface, authed ONLY by the one-time signed-link
 * token (`?t=`), NOT by JWT (the customer is not logged in). Public route group.
 *
 * Phase 3 will add GET /:id/token (realtime client-secret mint) + WebRTC.
 */

const CONNECTED_SLOT_TTL_MS = 15 * 60_000; // hold the per-chat slot while a call is live

function publicView(s: IVoiceCallSession, storeName?: string | null) {
  return {
    sessionId: String(s._id),
    status: s.status,
    reason: s.reason,
    answererType: s.answerer_type,
    storeName: storeName ?? undefined,
    expiresAt: s.invite_expires_at,
  };
}

/**
 * Per-call prompt assembly (Phase E). The TEMPLATE is fully owned by the
 * super-admin (Store.voice_config.prompt_template) — NO prompt text lives in
 * code. This only fills the {variables} with real per-call data. Unknown
 * variables are left literal so typos are visible.
 */
function renderPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

async function buildPromptVars(opts: {
  storeId: string;
  chatId: string;
  storeName: string;
  agentName: string;
  language: string;
  reason: string;
  missingFields: string[];
}): Promise<Record<string, string>> {
  const [customer, msgs] = await Promise.all([
    User.findOne({ store_id: opts.storeId, chat_id: opts.chatId })
      .select('name phone')
      .lean<{ name?: string; phone?: string } | null>(),
    Message.find({ store_id: opts.storeId, chat_id: opts.chatId })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('sender text')
      .lean<Array<{ sender: string; text: string }>>(),
  ]);

  const recentMessages = msgs
    .reverse()
    .map((m) => `${m.sender === 'customer' ? 'Cliente' : 'Asistente'}: ${(m.text || '').slice(0, 200)}`)
    .join('\n');

  return {
    store_name: opts.storeName,
    agent_name: opts.agentName,
    language: opts.language,
    reason: opts.reason || '(sin motivo registrado)',
    customer_name: customer?.name || 'cliente',
    customer_phone: customer?.phone || '',
    recent_messages: recentMessages || '(sin historial)',
    missing_fields: opts.missingFields.length ? opts.missingFields.join(', ') : '(ninguno)',
  };
}

export async function voiceCallRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const { redis, config } = opts;

  /** Resolve the session and verify the link token. Replies 404 on any mismatch
   *  (never leak whether a session id exists). Returns null after replying. */
  async function authByToken(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<IVoiceCallSession | null> {
    const { id } = request.params as { id: string };
    const { t } = request.query as { t?: string };
    if (!t) {
      reply.status(401).send({ error: 'token required' });
      return null;
    }
    let session: IVoiceCallSession | null = null;
    try {
      session = await findSession(id);
    } catch {
      // invalid ObjectId etc. — treat as not found, don't leak
      session = null;
    }
    if (!session || !inviteTokenMatches(t, session.invite_token_hash)) {
      reply.status(404).send({ error: 'session not found' });
      return null;
    }
    return session;
  }

  // ── CREATE (n8n) — bearer-authed; returns the signed customer link ──
  app.post('/api/v1/voice-calls', async (request, reply) => {
    if (!bearerOk(request.headers.authorization, config.n8n.apiKey)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    const body = (request.body || {}) as {
      storeId?: string;
      chatId?: string;
      reason?: string;
      summary?: string;
      missing_fields?: string[];
      n8n_correlation_id?: string;
      idempotency_key?: string;
    };
    const storeId = body.storeId;
    const chatId = body.chatId;
    const idempotencyKey = body.idempotency_key;
    if (!storeId || !chatId || !idempotencyKey) {
      return reply.status(400).send({ error: 'storeId, chatId, idempotency_key required' });
    }

    // Idempotent replay → return the existing session (the first link is still
    // valid; we never re-issue the raw token).
    const existing = await VoiceCallSession.findOne({ store_id: storeId, idempotency_key: idempotencyKey })
      .select('status')
      .lean<{ _id: unknown; status: string } | null>();
    if (existing) {
      return reply.status(200).send({ sessionId: String(existing._id), status: existing.status, duplicate: true });
    }

    // Store must exist and be active.
    const store = await Store.findOne({ store_id: storeId })
      .select('status')
      .lean<{ status: string } | null>();
    if (!store) return reply.status(404).send({ error: 'store not found' });
    if (store.status !== 'active') return reply.status(409).send({ error: 'store not active' });

    // The chat must belong to this store (don't trust arbitrary store_id+chat_id).
    const known =
      (await Message.exists({ store_id: storeId, chat_id: chatId })) ||
      (await User.exists({ store_id: storeId, chat_id: chatId }));
    if (!known) return reply.status(422).send({ error: 'chat not recognized for this store' });

    // One active call per chat.
    if (!(await acquireCallSlot(redis, storeId, chatId, DEFAULT_INVITE_TTL_MS))) {
      return reply.status(409).send({ error: 'a call is already in progress for this chat' });
    }

    const reason = (body.summary || body.reason || '').slice(0, 300);
    const missingFields = Array.isArray(body.missing_fields)
      ? body.missing_fields.filter((f) => typeof f === 'string').slice(0, 10).map((f) => f.slice(0, 100))
      : [];
    let result: { session: IVoiceCallSession; token: string };
    try {
      result = await createSessionWithInvite({
        store_id: storeId,
        chat_id: chatId,
        reason,
        missing_fields: missingFields,
        provider: config.voice.provider,
        n8n_correlation_id: body.n8n_correlation_id ?? null,
        idempotency_key: idempotencyKey,
      });
    } catch (err) {
      await releaseCallSlot(redis, storeId, chatId);
      // Concurrent duplicate race (unique index) → return the existing session.
      if ((err as { code?: number }).code === 11000) {
        const dup = await VoiceCallSession.findOne({ store_id: storeId, idempotency_key: idempotencyKey })
          .select('status')
          .lean<{ _id: unknown; status: string } | null>();
        if (dup) return reply.status(200).send({ sessionId: String(dup._id), status: dup.status, duplicate: true });
      }
      logger.error({ err, storeId, chatId }, 'voice-call create failed');
      return reply.status(500).send({ error: 'could not create call' });
    }

    const link = buildCallLink(config.appPublicUrl, String(result.session._id), result.token);
    logger.info({ sessionId: String(result.session._id), storeId, chatId }, 'Voice call created (ringing)');
    return reply.status(201).send({
      sessionId: String(result.session._id),
      link,
      expiresAt: result.session.invite_token_expires_at,
    });
  });

  // ── GET status (render the ring/answer page) ──
  app.get('/api/v1/voice-calls/:id', async (request, reply) => {
    const session = await authByToken(request, reply);
    if (!session) return;
    const store = await Store.findOne({ store_id: session.store_id }).select('name').lean<{ name: string } | null>();
    return publicView(session, store?.name);
  });

  // ── ANSWER (ringing → connecting), single-use ──
  app.post('/api/v1/voice-calls/:id/answer', async (request, reply) => {
    const session = await authByToken(request, reply);
    if (!session) return;

    // Link expired before answering → mark expired (if still ringing) and refuse.
    if (session.invite_token_expires_at && session.invite_token_expires_at < new Date()) {
      await transitionStatus(String(session._id), session.store_id, 'ringing', 'expired', {
        ended_by: 'system',
        ended_reason: 'link_expired',
      });
      return reply.status(410).send({ error: 'link expired' });
    }

    const updated = await transitionStatus(
      String(session._id),
      session.store_id,
      'ringing',
      'connecting',
      { invite_token_used_at: new Date(), answerer_type: session.answerer_type },
    );
    if (!updated) {
      // Lost the race (already answered on another device / no longer ringing).
      return reply.status(409).send({ error: 'call is no longer answerable' });
    }
    await extendCallSlot(redis, updated.store_id, updated.chat_id, CONNECTED_SLOT_TTL_MS);
    logger.info({ sessionId: String(updated._id), storeId: updated.store_id }, 'Voice call answered');
    return publicView(updated);
  });

  // ── REJECT (ringing → rejected) ──
  app.post('/api/v1/voice-calls/:id/reject', async (request, reply) => {
    const session = await authByToken(request, reply);
    if (!session) return;
    const updated = await transitionStatus(String(session._id), session.store_id, 'ringing', 'rejected', {
      ended_by: 'customer',
      ended_reason: 'rejected',
    });
    await releaseCallSlot(redis, session.store_id, session.chat_id);
    if (!updated) return reply.status(409).send({ error: 'call is no longer rejectable' });
    return publicView(updated);
  });

  // ── END (any live state → ended) ──
  app.post('/api/v1/voice-calls/:id/end', async (request, reply) => {
    const session = await authByToken(request, reply);
    if (!session) return;
    const updated = await transitionStatus(
      String(session._id),
      session.store_id,
      ['ringing', 'connecting', 'active'],
      'ended',
      { ended_by: 'customer', ended_reason: 'customer_hangup' },
    );
    await releaseCallSlot(redis, session.store_id, session.chat_id);
    if (!updated) return reply.status(409).send({ error: 'call is not endable' });
    return publicView(updated);
  });

  // ── MINT LiveKit token (browser + Python agent worker join the same room) ──
  app.get('/api/v1/voice-calls/:id/token', async (request, reply) => {
    const session = await authByToken(request, reply);
    if (!session) return;

    if (session.status !== 'connecting') {
      return reply.status(409).send({ error: `call not connecting (is ${session.status})` });
    }
    const store = await Store.findOne({ store_id: session.store_id })
      .select('name status voice_config agent_config')
      .lean<{
        name: string;
        status: string;
        voice_config?: Partial<typeof VOICE_CONFIG_DEFAULTS>;
        agent_config?: { agent_name?: string };
      } | null>();
    if (!store || store.status !== 'active') {
      return reply.status(409).send({ error: 'store not active' });
    }
    // Merge so stores saved before newer fields existed still get defaults.
    const voiceConfig = { ...VOICE_CONFIG_DEFAULTS, ...(store.voice_config ?? {}) };
    if (!voiceConfig.enabled) {
      return reply.status(409).send({ error: 'voice calls disabled for this store' });
    }
    if (!livekitConfigured(config)) {
      return reply.status(503).send({ error: 'voice provider not configured' });
    }

    // Assemble the per-call prompt: admin-owned template + real context
    // (customer profile + recent WhatsApp messages + what's missing).
    const promptVars = await buildPromptVars({
      storeId: session.store_id,
      chatId: session.chat_id,
      storeName: store.name,
      agentName: store.agent_config?.agent_name || store.name,
      language: voiceConfig.language,
      reason: session.reason,
      missingFields: session.missing_fields || [],
    });
    const instructions = renderPromptTemplate(voiceConfig.prompt_template, promptVars);

    // Metadata the agent worker reads on join: per-store voice_config + the
    // fully rendered instructions.
    const metadata = {
      session_id: String(session._id),
      store_id: session.store_id,
      store_name: store.name,
      chat_id: session.chat_id,
      reason: session.reason,
      voice_config: voiceConfig,
      instructions,
    };

    let grant;
    try {
      grant = await mintLiveKitToken(config, {
        sessionId: String(session._id),
        storeId: session.store_id,
        identity: `cust_${String(session._id)}`,
        metadata,
      });
    } catch (err) {
      logger.error({ err, sessionId: String(session._id) }, 'LiveKit token mint failed');
      await transitionStatus(String(session._id), session.store_id, ['connecting'], 'failed', {
        ended_by: 'provider',
        ended_reason: 'provider_unavailable',
        provider_error_message: err instanceof Error ? err.message : String(err),
      });
      return reply.status(502).send({ error: 'could not start voice session' });
    }

    // Mark the call live + record the room. Best-effort: if the customer hung
    // up during the mint, this loses the race → 409.
    const live = await transitionStatus(String(session._id), session.store_id, ['connecting'], 'active', {
      context_built_at: new Date(),
      provider_session_id: grant.room,
    });
    if (!live) return reply.status(409).send({ error: 'call no longer active' });

    return { token: grant.token, url: grant.url, room: grant.room, identity: grant.identity };
  });

  // ── Provider availability (worker self-report → super-admin UI) ──
  //    The agent worker POSTs which provider keys it has (booleans only, never
  //    secrets) at boot; the voice-config UI grays out unavailable providers.
  const PROVIDERS_KEY = 'voice:providers';

  app.post('/api/v1/voice-providers/report', async (request, reply) => {
    if (!bearerOk(request.headers.authorization, config.n8n.apiKey)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
    const body = (request.body || {}) as Record<string, Record<string, boolean>>;
    await redis.set(PROVIDERS_KEY, JSON.stringify(body));
    logger.info({ providers: body }, 'Voice provider availability reported');
    return { ok: true };
  });

  app.get(
    '/api/v1/voice-providers',
    { preHandler: [app.authenticate] },
    async () => {
      const raw = await redis.get(PROVIDERS_KEY);
      return raw
        ? { reported: true, providers: JSON.parse(raw) }
        : { reported: false, providers: null };
    },
  );

  // ── DEV-only seed: create a ringing session + return the signed link. ──
  //    Lets us exercise Phases 2-3 before the n8n create endpoint (Phase 4) exists.
  if (config.nodeEnv !== 'production') {
    app.post('/api/v1/voice-calls/dev/seed', async (request, reply) => {
      const body = (request.body || {}) as { storeId?: string; chatId?: string; reason?: string };
      const storeId = body.storeId || 'store_leo';
      const chatId = body.chatId || 'whatsapp:+10000000000';
      const { session, token } = await createSessionWithInvite({
        store_id: storeId,
        chat_id: chatId,
        idempotency_key: `dev:${Date.now()}`,
        reason: body.reason || 'Dev seed test call',
        provider: config.voice.provider,
      });
      await acquireCallSlot(redis, storeId, chatId).catch(() => {});
      const link = buildCallLink(config.appPublicUrl, String(session._id), token);
      logger.warn({ sessionId: String(session._id), storeId }, 'DEV voice-call seeded');
      return reply.status(201).send({ sessionId: String(session._id), link, token });
    });
  }
}
