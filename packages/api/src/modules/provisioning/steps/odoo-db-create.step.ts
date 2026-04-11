import type { ProvisioningStep, StepContext } from '../step.types.js';
import { odooDbCreate, odooDbExists } from '../../../shared/odoo-scoped.js';
import { logger } from '../../../shared/logger.js';

export const odooDbCreateStep: ProvisioningStep = {
  name: 'odoo_db_create',
  async run(ctx: StepContext): Promise<void> {
    const { config, store } = ctx;
    const dbName = store.odoo_db;

    // Idempotent: skip if already exists
    const exists = await odooDbExists(config.odoo.url, dbName);
    if (exists) {
      logger.info({ dbName }, 'Odoo db already exists, skipping create');
      ctx.step.data = { db: dbName, skipped: true };
      return;
    }

    await odooDbCreate(config, dbName, {
      adminLogin: store.owner_email,
      adminPassword: config.odoo.defaultAdminPassword,
      lang: store.lang,
      countryCode: store.country_code,
    });

    ctx.step.data = { db: dbName, created: true };
  },
};
