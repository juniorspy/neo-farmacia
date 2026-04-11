import { randomUUID } from 'crypto';
import type { AppConfig } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { Store, type IStore } from './store.model.js';
import { ProvisioningJob, type IProvisioningJob } from './provisioning-job.model.js';
import { STEP_ORDER } from './step.types.js';
import { STEP_REGISTRY } from './steps/index.js';

export interface CreatePharmacyInput {
  name: string;
  owner_name: string;
  owner_email: string;
  owner_phone?: string;
  timezone?: string;
  currency?: string;
  country_code?: string;
  lang?: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

async function uniqueStoreId(base: string): Promise<string> {
  let candidate = base || `store_${randomUUID().slice(0, 8)}`;
  for (let i = 0; i < 5; i++) {
    const existing = await Store.findOne({ store_id: candidate });
    if (!existing) return candidate;
    candidate = `${base}_${randomUUID().slice(0, 4)}`;
  }
  return `${base}_${randomUUID().slice(0, 8)}`;
}

export async function createPharmacy(
  input: CreatePharmacyInput,
): Promise<{ store: IStore; job: IProvisioningJob }> {
  const slug = slugify(input.name);
  const storeId = await uniqueStoreId(slug);
  const odooDb = `pharmacy_${storeId}`;
  const meilisearchIndex = `store_${storeId}_products`;

  const store = await Store.create({
    store_id: storeId,
    name: input.name,
    owner_name: input.owner_name,
    owner_email: input.owner_email,
    owner_phone: input.owner_phone,
    timezone: input.timezone || 'America/Santo_Domingo',
    currency: input.currency || 'DOP',
    country_code: input.country_code || 'DO',
    lang: input.lang || 'es_DO',
    odoo_db: odooDb,
    meilisearch_index: meilisearchIndex,
    agent_config: {
      agent_name: 'Sofía',
      greeting_style: 'amigable',
      signature: `— ${input.name}`,
      business_hours: 'Lun-Sáb 8:00-22:00, Dom 9:00-20:00',
      delivery_info: '',
      custom_notes: '',
    },
    status: 'pending',
  });

  const job = await ProvisioningJob.create({
    store_id: storeId,
    status: 'pending',
    steps: STEP_ORDER.map((name) => ({ name, status: 'pending' })),
    current_step_index: 0,
    attempt: 0,
  });

  logger.info({ storeId, jobId: String(job._id) }, 'Pharmacy provisioning job created');
  return { store, job };
}

/**
 * Claim the next pending job and run its next step.
 * Returns true if work was done (caller may want to loop faster).
 */
export async function runNextJobStep(config: AppConfig): Promise<boolean> {
  // Find a job that's pending or running and not locked recently
  const staleLockMs = 5 * 60 * 1000;
  const now = new Date();
  const cutoff = new Date(now.getTime() - staleLockMs);

  const job = await ProvisioningJob.findOneAndUpdate(
    {
      status: { $in: ['pending', 'running'] },
      $or: [{ locked_at: null }, { locked_at: { $lt: cutoff } }],
    },
    { $set: { locked_at: now, status: 'running' } },
    { sort: { created_at: 1 }, new: true },
  );

  if (!job) return false;

  try {
    const stepState = job.steps[job.current_step_index];
    if (!stepState) {
      job.status = 'completed';
      job.locked_at = null;
      await job.save();
      // mark store active
      await Store.updateOne({ store_id: job.store_id }, { $set: { status: 'active' } });
      logger.info({ storeId: job.store_id }, 'Provisioning job completed');
      return true;
    }

    const step = STEP_REGISTRY[stepState.name];
    if (!step) throw new Error(`Unknown step: ${stepState.name}`);

    const store = await Store.findOne({ store_id: job.store_id });
    if (!store) throw new Error(`Store ${job.store_id} not found`);

    stepState.status = 'running';
    stepState.started_at = new Date();
    stepState.error = null;
    await job.save();

    logger.info(
      { storeId: job.store_id, step: stepState.name, index: job.current_step_index },
      'Running provisioning step',
    );

    await step.run({ config, store, job, step: stepState });

    stepState.status = 'done';
    stepState.finished_at = new Date();
    job.current_step_index += 1;
    job.attempt += 1;
    job.last_error = null;

    // If this was the final step, mark completed
    if (job.current_step_index >= job.steps.length) {
      job.status = 'completed';
      await Store.updateOne({ store_id: job.store_id }, { $set: { status: 'active' } });
      logger.info({ storeId: job.store_id }, 'Provisioning job completed');
    } else {
      job.status = 'pending'; // let it pick up again on next tick
    }
    job.locked_at = null;
    await job.save();
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, storeId: job.store_id }, 'Provisioning step failed');
    const stepState = job.steps[job.current_step_index];
    if (stepState) {
      stepState.status = 'failed';
      stepState.error = msg;
      stepState.finished_at = new Date();
    }
    job.status = 'failed';
    job.last_error = msg;
    job.locked_at = null;
    await job.save();
    await Store.updateOne({ store_id: job.store_id }, { $set: { status: 'failed' } });
    return true;
  }
}

export async function retryJob(storeId: string): Promise<IProvisioningJob | null> {
  const job = await ProvisioningJob.findOne({ store_id: storeId });
  if (!job) return null;
  const failed = job.steps[job.current_step_index];
  if (failed && failed.status === 'failed') {
    failed.status = 'pending';
    failed.error = null;
  }
  job.status = 'pending';
  job.last_error = null;
  job.locked_at = null;
  await job.save();
  await Store.updateOne({ store_id: storeId }, { $set: { status: 'provisioning' } });
  return job;
}
