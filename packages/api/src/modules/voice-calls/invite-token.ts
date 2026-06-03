import { randomBytes, createHash, timingSafeEqual } from 'crypto';

/**
 * One-time signed-link token for the customer call surface.
 * The raw token travels in the link (`/call/:id?t=<token>`); only its SHA-256
 * hash is stored on the session. Comparison is constant-time.
 */

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url'); // ~43 url-safe chars
}

export function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function inviteTokenMatches(raw: string, hash: string | null): boolean {
  if (!raw || !hash) return false;
  const a = Buffer.from(hashInviteToken(raw));
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildCallLink(appPublicUrl: string, sessionId: string, rawToken: string): string {
  return `${appPublicUrl.replace(/\/$/, '')}/call/${sessionId}?t=${rawToken}`;
}
