import type { ProvisioningStep, StepContext } from '../step.types.js';
import {
  ScopedOdoo,
  odooDbCreate,
  odooDbDrop,
  odooDbExists,
} from '../../../shared/odoo-scoped.js';
import { logger } from '../../../shared/logger.js';

/**
 * Verify a DB is healthy by trying to authenticate as the expected admin user.
 * If the DB exists but auth fails, it's in a broken partial state — safer to
 * drop and recreate than to leave half-provisioned.
 */
async function verifyDbHealthy(
  url: string,
  dbName: string,
  login: string,
  password: string,
): Promise<boolean> {
  try {
    const client = new ScopedOdoo({ url, db: dbName, user: login, password });
    const uid = await client.authenticate();
    return typeof uid === 'number' && uid > 0;
  } catch (err) {
    logger.warn({ err, dbName }, 'Odoo db health check failed');
    return false;
  }
}

export const odooDbCreateStep: ProvisioningStep = {
  name: 'odoo_db_create',
  async run(ctx: StepContext): Promise<void> {
    const { config, store, step } = ctx;
    const dbName = store.odoo_db;
    const adminPassword = (step.data?.admin_password as string) || config.odoo.defaultAdminPassword;

    const exists = await odooDbExists(config.odoo.url, dbName);
    if (exists) {
      // Verify the existing DB is actually healthy, not a partial corpse.
      const healthy = await verifyDbHealthy(
        config.odoo.url,
        dbName,
        store.owner_email,
        adminPassword,
      );
      if (healthy) {
        logger.info({ dbName }, 'Odoo db exists and is healthy, skipping create');
        step.data = { ...step.data, db: dbName, skipped: true, verified: true };
        return;
      }
      logger.warn({ dbName }, 'Odoo db exists but unhealthy, dropping and recreating');
      await odooDbDrop(config.odoo.url, config.odoo.masterPassword, dbName);
    }

    await odooDbCreate(config, dbName, {
      adminLogin: store.owner_email,
      adminPassword,
      lang: store.lang,
      countryCode: store.country_code,
    });

    // Post-create verification — fail loud if auth still doesn't work.
    const healthy = await verifyDbHealthy(
      config.odoo.url,
      dbName,
      store.owner_email,
      adminPassword,
    );
    if (!healthy) {
      throw new Error(
        `Odoo db ${dbName} was created but post-create auth failed — likely master password mismatch or Odoo config issue`,
      );
    }

    step.data = { ...step.data, db: dbName, created: true, verified: true };
  },
};
