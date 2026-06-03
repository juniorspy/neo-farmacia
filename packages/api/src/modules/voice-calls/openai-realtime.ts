import axios from 'axios';
import { logger } from '../../shared/logger.js';
import type { AppConfig } from '../../config/env.js';

/**
 * Mint a short-lived OpenAI Realtime ephemeral client secret. The browser uses
 * the returned `value` to do the SDP exchange DIRECTLY with OpenAI — our API key
 * never reaches the client and our backend never touches SDP.
 *
 * NOTE: OpenAI's Realtime endpoints/shapes evolve. This targets the
 * `/v1/realtime/sessions` ephemeral-session shape; adjust `endpoint`/response
 * extraction if the account is on a newer `client_secrets` API.
 */

export interface RealtimeSecret {
  value: string;
  expiresAt: number | null;
  model: string;
  voice: string;
  providerSessionId: string | null;
}

export async function mintRealtimeClientSecret(
  config: AppConfig,
  opts: { instructions: string },
): Promise<RealtimeSecret> {
  const apiKey = config.voice.openaiApiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = config.voice.model;
  const voice = config.voice.voiceName;

  const res = await axios.post(
    'https://api.openai.com/v1/realtime/sessions',
    {
      model,
      voice,
      instructions: opts.instructions,
      modalities: ['audio', 'text'],
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    },
  );

  const data = (res.data ?? {}) as Record<string, unknown>;
  const clientSecret = data.client_secret as { value?: string; expires_at?: number } | undefined;
  const value = clientSecret?.value || (data.value as string | undefined) || null;
  if (!value) {
    logger.error({ keys: Object.keys(data) }, 'Realtime session: no client_secret in response');
    throw new Error('OpenAI did not return a client_secret');
  }

  return {
    value,
    expiresAt: clientSecret?.expires_at ?? (data.expires_at as number | undefined) ?? null,
    model,
    voice,
    providerSessionId: (data.id as string | undefined) ?? null,
  };
}
