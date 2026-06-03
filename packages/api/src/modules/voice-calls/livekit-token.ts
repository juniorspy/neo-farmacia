import { AccessToken } from 'livekit-server-sdk';
import type { AppConfig } from '../../config/env.js';

/**
 * Mint a short-lived LiveKit access token scoped to ONE room. The customer's
 * browser joins the room with it; the Python agent worker joins the same room
 * and reads `participant.metadata` (context + the store's voice_config) to
 * configure its STT/LLM/TTS for this call. Provider API keys never leave the
 * server — the browser only ever receives this scoped token.
 */

export interface LiveKitGrant {
  token: string;
  url: string;
  room: string;
  identity: string;
}

export function livekitConfigured(config: AppConfig): boolean {
  const { url, apiKey, apiSecret } = config.livekit;
  return Boolean(url && apiKey && apiSecret);
}

export async function mintLiveKitToken(
  config: AppConfig,
  opts: {
    sessionId: string;
    storeId: string;
    identity: string;
    metadata: Record<string, unknown>;
  },
): Promise<LiveKitGrant> {
  if (!livekitConfigured(config)) throw new Error('LiveKit not configured');
  const { url, apiKey, apiSecret } = config.livekit;

  const room = `voice_${opts.storeId}_${opts.sessionId}`;
  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    metadata: JSON.stringify(opts.metadata),
    ttl: '15m', // covers the max call duration; the room dies with the call
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  return { token: await at.toJwt(), url, room, identity: opts.identity };
}
