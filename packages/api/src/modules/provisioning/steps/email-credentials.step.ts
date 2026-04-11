import type { ProvisioningStep, StepContext } from '../step.types.js';
import { logger } from '../../../shared/logger.js';

/**
 * Stub: logs the credentials and keeps plaintext password in step data so
 * a super-admin can retrieve them from the admin UI until they explicitly
 * mark them as delivered (or until real email sending is wired up).
 * When real email infra lands, replace this with actual SMTP/transactional
 * send and clear step.data.admin_password on success.
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
      '[TODO: send email] pharmacy credentials ready — retrieve via admin UI',
    );

    // Intentionally KEEP admin_password in step.data so super-admin can copy it.
    // It gets cleared when the markCredentialsDelivered endpoint is called.
    step.data = {
      ...step.data,
      sent: false,
      stubbed: true,
      delivered: false,
    };
  },
};
