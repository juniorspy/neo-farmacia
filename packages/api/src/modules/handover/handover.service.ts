import type Redis from 'ioredis';

export type SessionMode = 'bot' | 'manual';

/**
 * Get current session mode for a chat. Defaults to 'bot'.
 */
export async function getSessionMode(
  redis: Redis,
  storeId: string,
  chatId: string,
): Promise<SessionMode> {
  const mode = await redis.get(`session:${storeId}:${chatId}`);
  return (mode as SessionMode) || 'bot';
}

/**
 * Set session mode for a chat.
 */
export async function setSessionMode(
  redis: Redis,
  storeId: string,
  chatId: string,
  mode: SessionMode,
): Promise<void> {
  await redis.set(`session:${storeId}:${chatId}`, mode);
}

/**
 * Check if bot should handle this message (ingress check).
 */
export async function isBotActive(
  redis: Redis,
  storeId: string,
  chatId: string,
): Promise<boolean> {
  const mode = await getSessionMode(redis, storeId, chatId);
  return mode === 'bot';
}
