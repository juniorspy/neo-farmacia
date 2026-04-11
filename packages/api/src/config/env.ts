function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export function loadConfig() {
  return {
    nodeEnv: optional('NODE_ENV', 'development'),
    port: parseInt(optional('PORT', '3000')),
    logLevel: optional('LOG_LEVEL', 'info'),

    mongo: {
      uri: optional('MONGODB_URI', 'mongodb://localhost:27017/neo_farmacia'),
    },

    redis: {
      url: optional('REDIS_URL', 'redis://localhost:6379'),
    },

    odoo: {
      url: optional('ODOO_URL', 'https://pos.leofarmacia.com'),
      db: optional('ODOO_DB', 'odoo'),
      user: optional('ODOO_USER', 'admin'),
      password: optional('ODOO_PASSWORD', 'admin'),
    },

    evolution: {
      apiUrl: optional('EVOLUTION_API_URL', 'https://evo.onrpa.com'),
      masterKey: optional('EVOLUTION_MASTER_KEY', ''),
    },

    meilisearch: {
      url: optional('MEILISEARCH_URL', 'https://melisearch.onrpa.com'),
      apiKey: optional('MEILISEARCH_API_KEY', ''),
    },

    n8n: {
      webhookUrl: optional('N8N_WEBHOOK_URL', ''),
      apiKey: optional('N8N_API_KEY', ''),
    },

    jwt: {
      secret: optional('JWT_SECRET', 'dev-secret-change-in-production'),
      expiration: parseInt(optional('JWT_EXPIRATION', '86400000')),
    },

    debounce: {
      windowMs: parseInt(optional('DEBOUNCE_WINDOW_MS', '2000')),
    },

    mutex: {
      ttlMs: parseInt(optional('MUTEX_TTL_MS', '30000')),
    },

    cache: {
      productTtlSec: parseInt(optional('PRODUCT_CACHE_TTL_SEC', '300')),
    },
  } as const;
}

export type AppConfig = ReturnType<typeof loadConfig>;
