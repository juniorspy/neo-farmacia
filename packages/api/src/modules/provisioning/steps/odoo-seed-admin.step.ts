import type { ProvisioningStep, StepContext } from '../step.types.js';
import { makeScopedOdoo } from '../../../shared/odoo-scoped.js';
import { ensureServiceUser } from '../../../shared/odoo-store-ops.js';
import { logger } from '../../../shared/logger.js';

/**
 * After db creation, ensure the admin user record has the right name,
 * timezone, and lang, and that the company record matches the pharmacy name.
 * The admin user itself was created by odoo db.create_database with the
 * owner_email as login.
 *
 * Also seeds the platform's internal service user (config.odoo.user) into the
 * new DB so getScopedOdoo() works against it — catalog-sync, commands and
 * dashboard routes all authenticate with that login (Stage 10, decision D1).
 */
export const odooSeedAdminStep: ProvisioningStep = {
  name: 'odoo_seed_admin',
  async run(ctx: StepContext): Promise<void> {
    const { config, store, step } = ctx;
    const adminPassword = (step.data?.admin_password as string) || config.odoo.defaultAdminPassword;
    const client = makeScopedOdoo(config, store.odoo_db, store.owner_email, adminPassword);

    // Find admin user (login = owner_email)
    const users = (await client.execute(
      'res.users',
      'search_read',
      [[['login', '=', store.owner_email]]],
      { fields: ['id', 'name', 'company_id'], limit: 1 },
    )) as Array<{ id: number; name: string; company_id: [number, string] }>;

    if (!users || users.length === 0) {
      throw new Error(`Admin user ${store.owner_email} not found in ${store.odoo_db}`);
    }
    const user = users[0];

    // Update user
    await client.execute('res.users', 'write', [
      [user.id],
      { name: store.owner_name, tz: store.timezone, lang: store.lang },
    ]);

    // Update the default company name to match the pharmacy
    const companyId = user.company_id[0];
    await client.execute('res.company', 'write', [
      [companyId],
      { name: store.name, phone: store.owner_phone || false, email: store.owner_email },
    ]);

    // Internal service user — the credential every per-store client uses.
    // Skip if the configured service login IS the admin login (edge config).
    let serviceUserId: number | null = null;
    if (config.odoo.user.toLowerCase() !== store.owner_email.toLowerCase()) {
      serviceUserId = await ensureServiceUser(client, config.odoo.user, config.odoo.password);
    }

    logger.info(
      { db: store.odoo_db, userId: user.id, companyId, serviceUserId },
      'Odoo admin + company updated, service user ensured',
    );

    ctx.step.data = { user_id: user.id, company_id: companyId, service_user_id: serviceUserId };
  },
};
