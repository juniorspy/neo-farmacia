import { timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * Constant-time bearer check for n8n-facing routes. FAILS CLOSED: an empty
 * expected key never authorizes (production boot already guarantees
 * N8N_API_KEY is set — see config/env.ts).
 */
export function n8nBearerOk(authHeader: string | undefined, expected: string): boolean {
  if (!authHeader || !expected) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Route guard for n8n-facing routes. Replies 401 and returns false when the
 * bearer doesn't match. Dev convenience: with no key configured OUTSIDE
 * production, the route stays open (in production the boot guard makes an
 * empty key impossible).
 */
export function makeN8nGuard(config: AppConfig) {
  return function requireN8n(request: FastifyRequest, reply: FastifyReply): boolean {
    if (!config.n8n.apiKey && config.nodeEnv !== 'production') return true;
    if (n8nBearerOk(request.headers.authorization, config.n8n.apiKey)) return true;
    reply.status(401).send({ error: 'unauthorized' });
    return false;
  };
}
