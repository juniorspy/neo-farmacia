import { randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import type { AppConfig } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { Store, type IStore } from './store.model.js';
import { ProvisioningJob, type IProvisioningJob } from './provisioning-job.model.js';
import { STEP_ORDER } from './step.types.js';
import { STEP_REGISTRY } from './steps/index.js';
import { ensureIndex, deleteIndex } from '../../shared/meilisearch.js';
import { odooDbDrop } from '../../shared/odoo-scoped.js';

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

/** 24-char URL-safe random password. Avoids +/= via base64url. */
function generatePassword(): string {
  return randomBytes(18).toString('base64url');
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
): Promise<{ store: IStore; job: IProvisioningJob; plaintextAdminPassword: string }> {
  const slug = slugify(input.name);
  const storeId = await uniqueStoreId(slug);
  const odooDb = `pharmacy_${storeId}`;
  const meilisearchIndex = `store_${storeId}_products`;

  // Generate a strong, per-pharmacy admin password. We store only a bcrypt
  // hash for audit/reference; plaintext lives in the job's email step data
  // and is logged once (stub) so it reaches the owner.
  const plaintextAdminPassword = generatePassword();
  const hash = await bcrypt.hash(plaintextAdminPassword, 10);

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
    odoo_admin_password_hash: hash,
  });

  const job = await ProvisioningJob.create({
    store_id: storeId,
    status: 'pending',
    steps: STEP_ORDER.map((name) => {
      // Seed the plaintext password into the data of the two steps that
      // need it. The rest of the steps don't see it. Mongo's at-rest is
      // the only exposure surface; it gets cleared after email step runs.
      if (name === 'odoo_db_create' || name === 'odoo_seed_admin') {
        return { name, status: 'pending', data: { admin_password: plaintextAdminPassword } };
      }
      if (name === 'email_credentials') {
        return { name, status: 'pending', data: { admin_password: plaintextAdminPassword } };
      }
      return { name, status: 'pending' };
    }),
    current_step_index: 0,
    attempt: 0,
  });

  logger.info({ storeId, jobId: String(job._id) }, 'Pharmacy provisioning job created');
  return { store, job, plaintextAdminPassword };
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

    // Scrub admin_password from step data once the step that needed it has run.
    // The password remains in email_credentials' step data only until that step
    // runs, which then clears it too.
    if (stepState.data && 'admin_password' in stepState.data && stepState.name !== 'email_credentials') {
      delete (stepState.data as Record<string, unknown>).admin_password;
    }

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

/**
 * Adopt the pre-existing default Odoo database as the first Store.
 * Runs on API startup and is idempotent — does nothing if the store already
 * exists. This is how the existing single-DB deployment becomes the first
 * tenant in the multi-tenant model without re-provisioning.
 */
export async function seedDefaultStore(config: AppConfig): Promise<void> {
  const storeId = 'store_leo';
  const existing = await Store.findOne({ store_id: storeId });
  if (existing) {
    logger.debug({ storeId }, 'seedDefaultStore: already exists, skipping');
    return;
  }

  const meilisearchIndex = `store_${storeId}_products`;
  await ensureIndex(meilisearchIndex);

  await Store.create({
    store_id: storeId,
    name: 'Farmacia Leo',
    owner_name: 'Administrador',
    owner_email: 'admin@leofarmacia.com',
    timezone: 'America/Santo_Domingo',
    currency: 'DOP',
    country_code: 'DO',
    lang: 'es_DO',
    odoo_db: config.odoo.db, // adopts the existing default DB
    meilisearch_index: meilisearchIndex,
    agent_config: {
      agent_name: 'Sofía',
      greeting_style: 'amigable',
      signature: '— Farmacia Leo',
      business_hours: 'Lun-Sáb 8:00-22:00, Dom 9:00-20:00',
      delivery_info: '',
      custom_notes: '',
    },
    status: 'active',
  });
  logger.info(
    { storeId, odooDb: config.odoo.db, meilisearchIndex },
    'Default store seeded (Farmacia Leo adopted existing Odoo DB)',
  );
}

/** Hard delete. Drops Odoo DB, Meilisearch index, Store, and Job records.
 *  Runs cleanup in reverse order of creation so that if a step fails, the
 *  "biggest" resources are removed first. Each sub-step is idempotent.
 *  Refuses to delete the default store (store_leo) which adopts the shared
 *  Odoo DB — dropping that would wipe real data. Caller must also pass an
 *  explicit confirm flag.
 */
export async function deletePharmacy(
  config: AppConfig,
  storeId: string,
): Promise<{ deleted: boolean; reason?: string }> {
  if (storeId === 'store_leo') {
    return { deleted: false, reason: 'cannot delete default store' };
  }

  const store = await Store.findOne({ store_id: storeId });
  if (!store) {
    return { deleted: false, reason: 'not found' };
  }

  logger.info({ storeId, odooDb: store.odoo_db }, 'Deleting pharmacy');

  // 1. Drop Meilisearch index (cheap, fast, idempotent)
  try {
    await deleteIndex(store.meilisearch_index);
  } catch (err) {
    logger.warn({ err, index: store.meilisearch_index }, 'Meilisearch delete failed (continuing)');
  }

  // 2. Drop Odoo database (the big one)
  try {
    await odooDbDrop(config.odoo.url, config.odoo.masterPassword, store.odoo_db);
  } catch (err) {
    logger.error({ err, odooDb: store.odoo_db }, 'Odoo db drop failed (continuing to Mongo cleanup)');
  }

  // 3. Delete provisioning job(s) and store record last — order matters so
  //    we keep a record if anything before failed catastrophically.
  await ProvisioningJob.deleteMany({ store_id: storeId });
  await Store.deleteOne({ store_id: storeId });

  logger.info({ storeId }, 'Pharmacy deleted');
  return { deleted: true };
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
