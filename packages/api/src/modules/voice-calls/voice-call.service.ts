import type Redis from 'ioredis';
import { logger } from '../../shared/logger.js';
import {
  VoiceCallSession,
  type IVoiceCallSession,
  type VoiceCallStatus,
} from './voice-call.model.js';
import { generateInviteToken, hashInviteToken } from './invite-token.js';

/**
 * Phase 1 — session lifecycle primitives: create, atomic guarded transitions,
 * a per-chat "one active call" lock in Redis, and a sweep for expired rings.
 * No HTTP, no provider, no context assembly yet (later phases).
 */

const DEFAULT_RING_WINDOW_MS = 90_000; // 90s to answer before "missed"

export interface CreateSessionInput {
  store_id: string;
  chat_id: string;
  idempotency_key: string;
  client_id?: string | null;
  answerer_type?: IVoiceCallSession['answerer_type'];
  reason?: string;
  missing_fields?: string[];
  provider?: string; // caller passes config.voice.provider (or a per-store override)
  n8n_correlation_id?: string | null;
  ring_window_ms?: number;
  invite_token_hash?: string | null;
  invite_token_expires_at?: Date | null;
}

export const DEFAULT_INVITE_TTL_MS = 10 * 60_000; // signed link valid 10 min

/** Create a fresh session in `ringing`. Throws on duplicate {store_id, idempotency_key}. */
export async function createSession(input: CreateSessionInput): Promise<IVoiceCallSession> {
  const now = new Date();
  const windowMs = input.ring_window_ms ?? DEFAULT_RING_WINDOW_MS;
  return VoiceCallSession.create({
    store_id: input.store_id,
    chat_id: input.chat_id,
    client_id: input.client_id ?? null,
    answerer_type: input.answerer_type ?? 'customer',
    reason: input.reason ?? '',
    missing_fields: input.missing_fields ?? [],
    idempotency_key: input.idempotency_key,
    // Provider is config-driven (env VOICE_PROVIDER, future per-store override).
    // If the caller doesn't pass one, the schema default applies.
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.invite_token_hash ? { invite_token_hash: input.invite_token_hash } : {}),
    ...(input.invite_token_expires_at
      ? { invite_token_expires_at: input.invite_token_expires_at }
      : {}),
    n8n_correlation_id: input.n8n_correlation_id ?? null,
    status: 'ringing',
    ringing_at: now,
    last_state_at: now,
    invite_expires_at: new Date(now.getTime() + windowMs),
  });
}

/**
 * Create a ringing session AND issue its one-time signed-link token. Returns
 * the raw token (shown once, to build the link); only its hash is persisted.
 * Reused by the n8n create endpoint (Phase 4) and the dev seed.
 */
export async function createSessionWithInvite(
  input: CreateSessionInput & { invite_ttl_ms?: number },
): Promise<{ session: IVoiceCallSession; token: string }> {
  const token = generateInviteToken();
  const ttl = input.invite_ttl_ms ?? DEFAULT_INVITE_TTL_MS;
  const session = await createSession({
    ...input,
    // Ring lasts as long as the link is valid — the customer may open the
    // WhatsApp link minutes after it's sent, not within a 90s phone-ring window.
    ring_window_ms: input.ring_window_ms ?? ttl,
    invite_token_hash: hashInviteToken(token),
    invite_token_expires_at: new Date(Date.now() + ttl),
  });
  return { session, token };
}

export async function findSession(
  sessionId: string,
  storeId?: string,
): Promise<IVoiceCallSession | null> {
  const query: Record<string, unknown> = { _id: sessionId };
  if (storeId) query.store_id = storeId;
  return VoiceCallSession.findOne(query);
}

const TERMINAL: VoiceCallStatus[] = ['ended', 'rejected', 'missed', 'failed', 'expired'];

/**
 * Atomically move a session from one of `from` states to `to`. Returns the
 * updated doc, or null if the guard didn't match (lost a race — already
 * answered/expired/etc). Never load-then-save. Stamps lifecycle timestamps.
 */
export async function transitionStatus(
  sessionId: string,
  storeId: string,
  from: VoiceCallStatus | VoiceCallStatus[],
  to: VoiceCallStatus,
  extra: Record<string, unknown> = {},
): Promise<IVoiceCallSession | null> {
  const fromList = Array.isArray(from) ? from : [from];
  const now = new Date();
  const set: Record<string, unknown> = { status: to, last_state_at: now, ...extra };
  if (to === 'active') set.connected_at = now;
  if (TERMINAL.includes(to)) set.ended_at = now;

  const updated = await VoiceCallSession.findOneAndUpdate(
    { _id: sessionId, store_id: storeId, status: { $in: fromList } },
    { $set: set },
    { returnDocument: 'after' },
  );
  if (!updated) {
    logger.debug({ sessionId, storeId, from: fromList, to }, 'Voice call transition lost race');
  }
  return updated;
}

// ── Redis: one active call per chat ──

function slotKey(storeId: string, chatId: string): string {
  return `voicecall:active:${storeId}:${chatId}`;
}

/**
 * Reserve the single active-call slot for a chat. Returns true if reserved,
 * false if another call is already ringing/active for this chat.
 */
export async function acquireCallSlot(
  redis: Redis,
  storeId: string,
  chatId: string,
  ttlMs: number = DEFAULT_RING_WINDOW_MS,
): Promise<boolean> {
  const result = await redis.set(slotKey(storeId, chatId), '1', 'PX', ttlMs, 'NX');
  return result !== null;
}

/** Extend the active-call slot once a call connects (so it outlives the ring window). */
export async function extendCallSlot(
  redis: Redis,
  storeId: string,
  chatId: string,
  ttlMs: number,
): Promise<void> {
  await redis.set(slotKey(storeId, chatId), '1', 'PX', ttlMs);
}

export async function releaseCallSlot(
  redis: Redis,
  storeId: string,
  chatId: string,
): Promise<void> {
  await redis.del(slotKey(storeId, chatId));
}

export interface MissedRing {
  sessionId: string;
  store_id: string;
  chat_id: string;
}

/**
 * Sweep rings that were never answered past their deadline → `missed`.
 * Conditional/atomic per session, so it never clobbers a call that already
 * moved to connecting/active in a race. Returns the sessions that were
 * actually transitioned (the caller follows up with the customer) — the
 * atomic guard guarantees each missed call is returned exactly once.
 */
export async function expireStaleRings(now: Date = new Date()): Promise<MissedRing[]> {
  const stale = await VoiceCallSession.find({
    status: 'ringing',
    invite_expires_at: { $lt: now },
  })
    .select('_id store_id chat_id')
    .lean<Array<{ _id: unknown; store_id: string; chat_id: string }>>();

  const missed: MissedRing[] = [];
  for (const s of stale) {
    const updated = await transitionStatus(String(s._id), s.store_id, 'ringing', 'missed', {
      ended_by: 'system',
      ended_reason: 'ring_timeout',
    });
    if (updated) missed.push({ sessionId: String(s._id), store_id: s.store_id, chat_id: s.chat_id });
  }
  if (missed.length > 0) logger.info({ missed: missed.length }, 'Expired stale voice-call rings');
  return missed;
}
