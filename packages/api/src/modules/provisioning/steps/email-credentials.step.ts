import type { ProvisioningStep, StepContext } from '../step.types.js';
import { logger } from '../../../shared/logger.js';

/**
 * Stub: logs the credentials the owner needs. Replace with real SMTP /
 * transactional email sending when email infra is wired up.
 */
export const emailCredentialsStep: ProvisioningStep = {
  name: 'email_credentials',
  async run(ctx: StepContext): Promise<void> {
    const { store } = ctx;
    logger.info(
      {
        to: store.owner_email,
        pharmacy: store.name,
        dashboard: 'https://app.leofarmacia.com',
        odoo_db: store.odoo_db,
      },
      '[TODO: send email] pharmacy credentials ready',
    );
    ctx.step.data = { sent: false, stubbed: true };
  },
};
