import { loadConfig } from './config/env.js';
import { getRedis, closeRedis } from './shared/redis.js';
import { connectMongo, closeMongo } from './shared/mongo.js';
import { initOdoo } from './shared/odoo.js';
import { initEvolution } from './modules/evolution/evolution.client.js';
import { buildApp } from './app.js';
import { seedDefaultAdmin } from './modules/auth/auth.service.js';
import { initMeilisearch } from './shared/meilisearch.js';
import { startPeriodicSync } from './modules/catalog-sync/catalog-sync.service.js';
import { startProvisioningWorker } from './modules/provisioning/provisioning.worker.js';
import { seedDefaultStore } from './modules/provisioning/provisioning.service.js';
import { migrateLegacyConnections } from './modules/whatsapp/connection.service.js';
import { logger } from './shared/logger.js';

async function main() {
  const config = loadConfig();

  logger.info({ env: config.nodeEnv }, 'Starting Neo Farmacia API');

  // Connect to services
  const redis = getRedis(config);
  await connectMongo(config);
  await initOdoo(config);
  initEvolution(config);
  initMeilisearch(config);

  // Seed default admin if DB is empty
  await seedDefaultAdmin();

  // Seed default store (adopts existing Odoo DB as Farmacia Leo, idempotent)
  await seedDefaultStore(config);

  // Migrate any legacy single-connection Store fields into WhatsappConnection docs
  await migrateLegacyConnections();

  // Build and start Fastify
  const app = await buildApp(redis, config);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info({ port: config.port }, 'Neo Farmacia API running');

  // Start periodic catalog sync (every 10 min, iterates all active stores)
  startPeriodicSync(config);

  // Start pharmacy provisioning worker
  startProvisioningWorker(config);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await app.close();
    await closeRedis();
    await closeMongo();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
