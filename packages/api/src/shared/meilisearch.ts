import axios, { type AxiosInstance } from 'axios';
import { logger } from './logger.js';
import type { AppConfig } from '../config/env.js';

let client: AxiosInstance | null = null;

export function initMeilisearch(config: AppConfig) {
  client = axios.create({
    baseURL: config.meilisearch.url,
    headers: {
      Authorization: `Bearer ${config.meilisearch.apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
  logger.info({ url: config.meilisearch.url }, 'Meilisearch client initialized');
}

function ensureClient(): AxiosInstance {
  if (!client) throw new Error('Meilisearch not initialized');
  return client;
}

export interface ProductDoc {
  id: number; // Odoo product_id (primary key)
  default_code: string | null;
  name: string;
  description?: string;
  category: string;
  category_id: number;
  price: number;
  stock: number;
  barcode?: string | null;
  image_url?: string | null;
}

// ── Index management ──

export async function ensureIndex(indexName: string): Promise<void> {
  const c = ensureClient();
  try {
    await c.get(`/indexes/${indexName}`);
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      await c.post('/indexes', { uid: indexName, primaryKey: 'id' });
      logger.info({ indexName }, 'Meilisearch index created');
      // Configure searchable + filterable + ranking
      await c.patch(`/indexes/${indexName}/settings`, {
        searchableAttributes: ['name', 'description', 'default_code', 'barcode'],
        filterableAttributes: ['category', 'category_id'],
        sortableAttributes: ['price', 'name'],
        typoTolerance: {
          enabled: true,
          minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
        },
      });
    } else {
      throw err;
    }
  }
}

export async function upsertDocuments(
  indexName: string,
  documents: ProductDoc[],
): Promise<number | null> {
  if (documents.length === 0) return null;
  const c = ensureClient();
  const res = await c.post(`/indexes/${indexName}/documents`, documents);
  const taskUid = (res.data?.taskUid as number) ?? null;
  logger.info({ indexName, count: documents.length, taskUid }, 'Meilisearch upsert documents');
  return taskUid;
}

/**
 * Wait for a Meilisearch task to reach a terminal state. Meili indexes
 * asynchronously: the POST above only enqueues — without this check a failed
 * indexing task looks like a successful sync. Tasks are processed in uid
 * order, so awaiting the LAST enqueued uid covers the whole batch run.
 * Throws on task failure/cancellation so callers record the error.
 */
export async function waitForTask(taskUid: number, timeoutMs = 60000): Promise<void> {
  const c = ensureClient();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await c.get(`/tasks/${taskUid}`);
    const { status, error } = res.data as {
      status: string;
      error?: { message?: string } | null;
    };
    if (status === 'succeeded') return;
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Meilisearch task ${taskUid} ${status}: ${error?.message || 'unknown'}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Meilisearch task ${taskUid} still ${status} after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function deleteDocuments(indexName: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const c = ensureClient();
  await c.post(`/indexes/${indexName}/documents/delete-batch`, ids);
  logger.info({ indexName, count: ids.length }, 'Meilisearch delete documents');
}

// Kept signature as-is; this is the idempotent delete already handling 404.
export async function deleteIndex(indexName: string): Promise<void> {
  const c = ensureClient();
  try {
    await c.delete(`/indexes/${indexName}`);
    logger.info({ indexName }, 'Meilisearch index deleted');
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status !== 404) throw err;
  }
}

// ── Synonyms ──

export async function setSynonyms(
  indexName: string,
  synonyms: Record<string, string[]>,
): Promise<void> {
  const c = ensureClient();
  await c.put(`/indexes/${indexName}/settings/synonyms`, synonyms);
  logger.info({ indexName, count: Object.keys(synonyms).length }, 'Meilisearch synonyms updated');
}

export async function getSynonyms(indexName: string): Promise<Record<string, string[]>> {
  const c = ensureClient();
  const res = await c.get(`/indexes/${indexName}/settings/synonyms`);
  return res.data || {};
}

// ── Search ──

export interface SearchOptions {
  limit?: number;
  offset?: number;
  filter?: string;
  attributesToRetrieve?: string[];
}

export interface SearchResponse {
  hits: ProductDoc[];
  query: string;
  processingTimeMs: number;
  limit: number;
  offset: number;
  estimatedTotalHits: number;
}

export async function searchIndex(
  indexName: string,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResponse> {
  const c = ensureClient();
  const res = await c.post(`/indexes/${indexName}/search`, {
    q: query,
    limit: opts.limit || 10,
    offset: opts.offset || 0,
    ...(opts.filter ? { filter: opts.filter } : {}),
    ...(opts.attributesToRetrieve ? { attributesToRetrieve: opts.attributesToRetrieve } : {}),
  });
  return res.data;
}

// ── Stats ──

export interface IndexStats {
  numberOfDocuments: number;
  isIndexing: boolean;
}

export async function getIndexStats(indexName: string): Promise<IndexStats> {
  const c = ensureClient();
  const res = await c.get(`/indexes/${indexName}/stats`);
  return {
    numberOfDocuments: (res.data?.numberOfDocuments as number) ?? 0,
    isIndexing: Boolean(res.data?.isIndexing),
  };
}

// ── Helpers ──

export function getStoreIndexName(storeId: string): string {
  return `store_${storeId}_products`;
}
