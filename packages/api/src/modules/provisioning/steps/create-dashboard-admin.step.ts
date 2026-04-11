import type { ProvisioningStep, StepContext } from '../step.types.js';
import { Admin } from '../../auth/admin.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * Create (or upsert) the pharmacist-role dashboard admin user for the new
 * pharmacy. Login = owner_email, password = the same random password used
 * to seed Odoo's admin (so one credential grants access to both surfaces).
 * Idempotent: if an Admin with this email already exists we add this store
 * to their stores list instead of creating a duplicate.
 */
export const createDashboardAdminStep: ProvisioningStep = {
  name: 'create_dashboard_admin',
  async run(ctx: StepContext): Promise<void> {
    const { store, step } = ctx;
    const password = step.data?.admin_password as string | undefined;
    if (!password) {
      throw new Error('create_dashboard_admin requires admin_password in step data');
    }

    const existing = await Admin.findOne({ email: store.owner_email });
    if (existing) {
      const alreadyHasStore = existing.stores.some((s) => s.id === store.store_id);
      if (!alreadyHasStore) {
        existing.stores.push({ id: store.store_id, name: store.name });
        await existing.save();
        logger.info(
          { storeId: store.store_id, email: store.owner_email },
          'Added store to existing dashboard admin',
        );
      }
      step.data = { ...step.data, admin_id: String(existing._id), reused_existing: true };
      return;
    }

    const admin = new Admin({
      email: store.owner_email,
      password, // bcrypt hash happens in admin.model pre-save hook
      name: store.owner_name,
      role: 'pharmacist',
      stores: [{ id: store.store_id, name: store.name }],
      active: true,
    });
    await admin.save();
    logger.info(
      { storeId: store.store_id, email: store.owner_email, adminId: String(admin._id) },
      'Dashboard admin created for pharmacy',
    );
    step.data = { ...step.data, admin_id: String(admin._id), reused_existing: false };
  },
};
