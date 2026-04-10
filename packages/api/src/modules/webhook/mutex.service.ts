import type Redis from 'ioredis';
import { logger } from '../../shared/logger.js';

/**
 * Acquire a per-conversation mutex to prevent concurrent n8n executions.
 * Returns true if acquired, false if another execution is in progress.
 */
export async function acquireMutex(
  redis: Redis,
  storeId: string,
  chatId: string,
  ttlMs: number,
): Promise<boolean> {
  const key = `mutex:${storeId}:${chatId}`;
  const result = await redis.set(key, '1', 'PX', ttlMs, 'NX');
  if (result) {
    logger.debug({ storeId, chatId }, 'Mutex acquired');
  }
  return result !== null;
}

/**
 * Release the conversation mutex.
 */
export async function releaseMutex(
  redis: Redis,
  storeId: string,
  chatId: string,
): Promise<void> {
  const key = `mutex:${storeId}:${chatId}`;
  await redis.del(key);
  logger.debug({ storeId, chatId }, 'Mutex released');
}
