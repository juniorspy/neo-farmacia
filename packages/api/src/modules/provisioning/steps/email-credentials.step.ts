import type { ProvisioningStep, StepContext } from '../step.types.js';
import { logger } from '../../../shared/logger.js';

/**
 * Stub: logs the credentials the owner needs. Replace with real SMTP /
 * transactional email sending when email infra is wired up. After "sending",
 * we clear the plaintext password from the job data so it only exists in
 * log history (and the owner's inbox).
 */
export const emailCredentialsStep: ProvisioningStep = {
  name: 'email_credentials',
  async run(ctx: StepContext): Promise<void> {
    const { store, step } = ctx;
    const adminPassword = step.data?.admin_password as string | undefined;

    logger.info(
      {
        to: store.owner_email,
        pharmacy: store.name,
        dashboard: 'https://app.leofarmacia.com',
        odoo_db: store.odoo_db,
        admin_login: store.owner_email,
        admin_password: adminPassword || '<missing>',
      },
      '[TODO: send email] pharmacy credentials ready',
    );

    // Scrub the plaintext password from job data now that the "email" was sent.
    step.data = { sent: false, stubbed: true, password_cleared: true };
  },
};
