import type { AppConfig } from '../../config/env.js';
import type { IStore } from './store.model.js';
import type { IProvisioningJob, IStepState } from './provisioning-job.model.js';

export interface StepContext {
  config: AppConfig;
  store: IStore;
  job: IProvisioningJob;
  step: IStepState;
}

export interface ProvisioningStep {
  name: string;
  run(ctx: StepContext): Promise<void>;
}

export const STEP_ORDER = [
  'mongo_store',
  'odoo_db_create',
  'odoo_seed_admin',
  'meilisearch_index',
  'agent_config',
  'email_credentials',
] as const;

export type StepName = (typeof STEP_ORDER)[number];
