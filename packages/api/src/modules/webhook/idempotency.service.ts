import type Redis from 'ioredis';

/**
 * Check if a message has already been processed.
 * Returns true if this is a duplicate (already seen).
 */
export async function isDuplicate(redis: Redis, messageId: string): Promise<boolean> {
  const result = await redis.set(`idempotent:${messageId}`, '1', 'EX', 3600, 'NX');
  return result === null; // null means key already existed
}
