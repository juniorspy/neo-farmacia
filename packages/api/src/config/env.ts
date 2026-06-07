function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export function loadConfig() {
  const config = {
    nodeEnv: optional('NODE_ENV', 'development'),
    port: parseInt(optional('PORT', '3000')),
    logLevel: optional('LOG_LEVEL', 'info'),
    // Public-facing URL where the API is reachable. Used when telling
    // external services (Evolution API) where to send webhooks.
    apiPublicUrl: optional('API_PUBLIC_URL', 'https://api.leofarmacia.com'),
    // Public origin of the dashboard/frontend (where /call/:id lives). Used to
    // build the signed customer call link that n8n sends over WhatsApp.
    appPublicUrl: optional('APP_PUBLIC_URL', 'https://app.leofarmacia.com'),

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
      masterPassword: optional('ODOO_MASTER_PASSWORD', 'admin'),
      defaultAdminEmail: optional('ODOO_DEFAULT_ADMIN_EMAIL', 'admin@example.com'),
      defaultAdminPassword: optional('ODOO_DEFAULT_ADMIN_PASSWORD', 'admin'),
      defaultCountryCode: optional('ODOO_DEFAULT_COUNTRY_CODE', 'DO'),
      defaultLang: optional('ODOO_DEFAULT_LANG', 'es_DO'),
      // Source DB for the master catalog cloned into each new pharmacy DB
      // (Stage 10, D2). Empty = use the main ODOO_DB.
      masterCatalogDb: optional('MASTER_CATALOG_DB', ''),
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
      // Order events (✗ item rejected, etc). The AI writes the customer
      // notice with conversation context. Empty = fall back to a plain
      // template sent directly via Evolution.
      orderEventWebhookUrl: optional('N8N_ORDER_EVENT_WEBHOOK_URL', ''),
    },

    voice: {
      // Voice transport label recorded on each call session. Per-pharmacy
      // provider/voice selection lives in Store.voice_config (super-admin).
      provider: optional('VOICE_PROVIDER', 'livekit_pipeline'),
    },

    livekit: {
      // LiveKit project for voice calls (dedicated farmacia project, NOT the
      // colmado one). The browser + Python agent worker join rooms here; this
      // API only mints scoped room tokens.
      url: optional('LIVEKIT_URL', ''),
      apiKey: optional('LIVEKIT_API_KEY', ''),
      apiSecret: optional('LIVEKIT_API_SECRET', ''),
    },

    jwt: {
      secret: optional('JWT_SECRET', 'dev-secret-change-in-production'),
      expiration: parseInt(optional('JWT_EXPIRATION', '86400000')),
    },

    docs: {
      // Swagger UI at /docs. Set DOCS_ENABLED=false to hide it in production.
      enabled: optional('DOCS_ENABLED', 'true') !== 'false',
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

  // Fail CLOSED in production: a missing secret must crash the boot loudly,
  // not leave the API silently open (forgeable JWTs, unauthenticated n8n
  // command dispatch). Dev keeps the convenient defaults.
  if (config.nodeEnv === 'production') {
    if (config.jwt.secret === 'dev-secret-change-in-production') {
      throw new Error('JWT_SECRET must be set in production (the dev default is public in the repo)');
    }
    if (!config.n8n.apiKey) {
      throw new Error('N8N_API_KEY must be set in production (n8n-facing routes would be open)');
    }
  }

  return config;
}

export type AppConfig = ReturnType<typeof loadConfig>;
