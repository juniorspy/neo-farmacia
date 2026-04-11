import type { ProvisioningStep, StepContext } from '../step.types.js';
import { Store } from '../store.model.js';

export const mongoStoreStep: ProvisioningStep = {
  name: 'mongo_store',
  async run(ctx: StepContext): Promise<void> {
    const { store } = ctx;
    // Store doc already exists (created at signup). Mark as provisioning.
    if (store.status === 'pending') {
      store.status = 'provisioning';
      await store.save();
    }
    // Double-check it exists in DB (idempotent sanity check).
    const found = await Store.findOne({ store_id: store.store_id });
    if (!found) throw new Error(`Store ${store.store_id} missing from Mongo`);
    ctx.step.data = { store_id: store.store_id };
  },
};
