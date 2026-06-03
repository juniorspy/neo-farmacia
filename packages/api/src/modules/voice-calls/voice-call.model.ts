import mongoose, { Schema, type Document } from 'mongoose';

/**
 * A voice-call session. The "invite" is not a separate entity — it is this
 * session in the `ringing` state. One lifecycle, one collection.
 *
 *   created ─▶ ringing ─┬─▶ connecting ─▶ active ─▶ ended
 *                       ├─▶ rejected
 *                       ├─▶ missed     (invite_expires_at passes)
 *                       ├─▶ expired    (link token expired before answer)
 *                       └─▶ failed     (provider/context/webrtc error)
 *
 * Transitions MUST be atomic, guarded Mongo updates (see voice-call.service.ts).
 * `answered` is folded into `connecting` on purpose.
 */

export type VoiceCallStatus =
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'ended'
  | 'rejected'
  | 'missed'
  | 'failed'
  | 'expired';

export type AnswererType = 'customer' | 'operator' | 'test';
export type EndedBy = 'customer' | 'operator' | 'provider' | 'system';

export interface IVoiceCallSession extends Document {
  store_id: string; // tenant isolation — always present
  chat_id: string; // "whatsapp:+18491234567" (device suffix stripped)
  client_id: string | null; // customer User _id

  answerer_type: AnswererType;
  status: VoiceCallStatus;
  reason: string; // why the AI asked for a call

  provider: string; // 'livekit_pipeline' — transport label, no abstraction layer
  provider_session_id: string | null; // the LiveKit room name once the call starts
  provider_error_code: string | null;
  provider_error_message: string | null;

  // One-time signed invite link. The token itself is never stored — only its hash.
  invite_token_hash: string | null;
  invite_token_expires_at: Date | null;
  invite_token_used_at: Date | null;
  accepted_by_user_id: string | null; // set for dashboard/test answers

  context_built_at: Date | null; // raw context is NOT persisted (PHI)
  n8n_correlation_id: string | null; // ties back to the webhook run

  idempotency_key: string; // dedup duplicate invites — unique per store
  ended_by: EndedBy | null;
  ended_reason: string | null;

  created_at: Date;
  ringing_at: Date | null;
  connected_at: Date | null; // stamped when status → active
  ended_at: Date | null; // stamped on any terminal state
  invite_expires_at: Date; // ring TTL → "missed"
  last_state_at: Date; // every transition stamps this — watchdog uses it
}

const voiceCallSchema = new Schema<IVoiceCallSession>({
  store_id: { type: String, required: true, index: true },
  chat_id: { type: String, required: true },
  client_id: { type: String, default: null },

  answerer_type: {
    type: String,
    enum: ['customer', 'operator', 'test'],
    default: 'customer',
  },
  status: {
    type: String,
    enum: ['ringing', 'connecting', 'active', 'ended', 'rejected', 'missed', 'failed', 'expired'],
    default: 'ringing',
    index: true,
  },
  reason: { type: String, default: '' },

  provider: { type: String, default: 'livekit_pipeline' },
  provider_session_id: { type: String, default: null },
  provider_error_code: { type: String, default: null },
  provider_error_message: { type: String, default: null },

  invite_token_hash: { type: String, default: null },
  invite_token_expires_at: { type: Date, default: null },
  invite_token_used_at: { type: Date, default: null },
  accepted_by_user_id: { type: String, default: null },

  context_built_at: { type: Date, default: null },
  n8n_correlation_id: { type: String, default: null },

  idempotency_key: { type: String, required: true },
  ended_by: { type: String, enum: ['customer', 'operator', 'provider', 'system', null], default: null },
  ended_reason: { type: String, default: null },

  created_at: { type: Date, default: Date.now },
  ringing_at: { type: Date, default: Date.now },
  connected_at: { type: Date, default: null },
  ended_at: { type: Date, default: null },
  invite_expires_at: { type: Date, required: true },
  last_state_at: { type: Date, default: Date.now },
});

// Dedup duplicate invites per tenant (NOT a global unique key).
voiceCallSchema.index({ store_id: 1, idempotency_key: 1 }, { unique: true });
// Fast lookups for sweeps and history.
voiceCallSchema.index({ store_id: 1, status: 1 });
voiceCallSchema.index({ store_id: 1, chat_id: 1, created_at: -1 });
// Resolve a session from the signed link's token hash.
voiceCallSchema.index({ invite_token_hash: 1 }, { unique: true, sparse: true });

export const VoiceCallSession = mongoose.model<IVoiceCallSession>(
  'VoiceCallSession',
  voiceCallSchema,
);
