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

export async function upsertDocuments(indexName: string, documents: ProductDoc[]): Promise<void> {
  if (documents.length === 0) return;
  const c = ensureClient();
  await c.post(`/indexes/${indexName}/documents`, documents);
  logger.info({ indexName, count: documents.length }, 'Meilisearch upsert documents');
}

export async function deleteDocuments(indexName: string, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const c = ensureClient();
  await c.post(`/indexes/${indexName}/documents/delete-batch`, ids);
  logger.info({ indexName, count: ids.length }, 'Meilisearch delete documents');
}

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

// ── Helpers ──

export function getStoreIndexName(storeId: string): string {
  return `store_${storeId}_products`;
}
