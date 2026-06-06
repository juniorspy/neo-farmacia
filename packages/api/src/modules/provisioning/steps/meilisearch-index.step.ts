import type { ProvisioningStep, StepContext } from '../step.types.js';
import { ensureIndex } from '../../../shared/meilisearch.js';
import { fullRebuildStoreIndex } from '../../catalog-sync/catalog-sync.service.js';
import { getScopedOdoo } from '../../../shared/odoo-scoped-cache.js';

export const meilisearchIndexStep: ProvisioningStep = {
  name: 'meilisearch_index',
  async run(ctx: StepContext): Promise<void> {
    const indexName = ctx.store.meilisearch_index;
    await ensureIndex(indexName); // idempotent

    // Immediate full sync from the freshly seeded Odoo catalog — the pharmacy
    // is born with a populated search index instead of waiting for the
    // periodic sync. Runs as the service user created by odoo_seed_admin.
    const client = getScopedOdoo(ctx.config, ctx.store.odoo_db);
    const indexed = await fullRebuildStoreIndex(ctx.store, client);

    ctx.step.data = { index: indexName, products_indexed: indexed };
  },
};
