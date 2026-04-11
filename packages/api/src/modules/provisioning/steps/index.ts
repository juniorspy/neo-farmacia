import type { ProvisioningStep } from '../step.types.js';
import { mongoStoreStep } from './mongo-store.step.js';
import { odooDbCreateStep } from './odoo-db-create.step.js';
import { odooSeedAdminStep } from './odoo-seed-admin.step.js';
import { createDashboardAdminStep } from './create-dashboard-admin.step.js';
import { meilisearchIndexStep } from './meilisearch-index.step.js';
import { agentConfigStep } from './agent-config.step.js';
import { emailCredentialsStep } from './email-credentials.step.js';

export const STEP_REGISTRY: Record<string, ProvisioningStep> = {
  [mongoStoreStep.name]: mongoStoreStep,
  [odooDbCreateStep.name]: odooDbCreateStep,
  [odooSeedAdminStep.name]: odooSeedAdminStep,
  [createDashboardAdminStep.name]: createDashboardAdminStep,
  [meilisearchIndexStep.name]: meilisearchIndexStep,
  [agentConfigStep.name]: agentConfigStep,
  [emailCredentialsStep.name]: emailCredentialsStep,
};
