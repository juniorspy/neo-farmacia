import type { ProvisioningStep, StepContext } from '../step.types.js';
import { ensureIndex } from '../../../shared/meilisearch.js';

export const meilisearchIndexStep: ProvisioningStep = {
  name: 'meilisearch_index',
  async run(ctx: StepContext): Promise<void> {
    const indexName = ctx.store.meilisearch_index;
    await ensureIndex(indexName); // idempotent
    ctx.step.data = { index: indexName };
  },
};
