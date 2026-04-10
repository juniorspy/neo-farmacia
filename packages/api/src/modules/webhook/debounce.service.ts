import type Redis from 'ioredis';
import { logger } from '../../shared/logger.js';

/**
 * Debounce messages from the same chat.
 * Accumulates text in Redis. Returns the accumulated text when the debounce window expires.
 * Returns null if the timer was reset (more messages expected).
 */
export async function debounceMessage(
  redis: Redis,
  storeId: string,
  chatId: string,
  text: string,
  windowMs: number,
): Promise<string | null> {
  const key = `debounce:${storeId}:${chatId}`;
  const lockKey = `debounce_lock:${storeId}:${chatId}`;

  // Append text to accumulated buffer
  const current = await redis.get(key);
  const accumulated = current ? `${current}\n${text}` : text;
  await redis.set(key, accumulated, 'PX', windowMs);

  // Wait for the debounce window
  await new Promise((r) => setTimeout(r, windowMs + 100));

  // Check if we're still the last writer
  const afterWait = await redis.get(key);
  if (afterWait !== accumulated) {
    // Another message came in and reset the timer
    return null;
  }

  // Try to acquire lock to be the one that processes
  const acquired = await redis.set(lockKey, '1', 'PX', 5000, 'NX');
  if (!acquired) return null;

  // Clean up and return accumulated text
  await redis.del(key);
  logger.debug({ storeId, chatId, accumulated }, 'Debounce complete');
  return accumulated;
}
