import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { Store } from './store.model.js';
import { ProvisioningJob } from './provisioning-job.model.js';
import { createPharmacy, retryJob } from './provisioning.service.js';

function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as { role: string } | undefined;
  if (!user || user.role !== 'admin') {
    reply.status(403).send({ error: 'Forbidden: super-admin only' });
    return false;
  }
  return true;
}

export async function adminRoutes(
  app: FastifyInstance,
  _opts: { config: AppConfig },
) {
  // List pharmacies with their provisioning state
  app.get(
    '/api/v1/admin/pharmacies',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!requireSuperAdmin(request, reply)) return;

      const stores = await Store.find().sort({ created_at: -1 }).lean();
      const jobs = await ProvisioningJob.find({
        store_id: { $in: stores.map((s) => s.store_id) },
      }).lean();
      const jobByStore = new Map(jobs.map((j) => [j.store_id, j]));

      return stores.map((s) => ({
        store_id: s.store_id,
        name: s.name,
        owner_name: s.owner_name,
        owner_email: s.owner_email,
        status: s.status,
        odoo_db: s.odoo_db,
        created_at: s.created_at,
        job: jobByStore.get(s.store_id)
          ? {
              status: jobByStore.get(s.store_id)!.status,
              current_step_index: jobByStore.get(s.store_id)!.current_step_index,
              steps: jobByStore.get(s.store_id)!.steps,
              last_error: jobByStore.get(s.store_id)!.last_error,
            }
          : null,
      }));
    },
  );

  // Get a single pharmacy
  app.get(
    '/api/v1/admin/pharmacies/:storeId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!requireSuperAdmin(request, reply)) return;
      const { storeId } = request.params as { storeId: string };
      const store = await Store.findOne({ store_id: storeId }).lean();
      if (!store) return reply.status(404).send({ error: 'Not found' });
      const job = await ProvisioningJob.findOne({ store_id: storeId }).lean();
      return { store, job };
    },
  );

  // Create new pharmacy (starts provisioning)
  app.post(
    '/api/v1/admin/pharmacies',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!requireSuperAdmin(request, reply)) return;

      const body = request.body as {
        name?: string;
        owner_name?: string;
        owner_email?: string;
        owner_phone?: string;
        timezone?: string;
        currency?: string;
        country_code?: string;
        lang?: string;
      };

      if (!body?.name || !body?.owner_name || !body?.owner_email) {
        return reply
          .status(400)
          .send({ error: 'name, owner_name, owner_email required' });
      }

      const { store, job } = await createPharmacy({
        name: body.name,
        owner_name: body.owner_name,
        owner_email: body.owner_email,
        owner_phone: body.owner_phone,
        timezone: body.timezone,
        currency: body.currency,
        country_code: body.country_code,
        lang: body.lang,
      });

      return reply.status(201).send({
        store_id: store.store_id,
        name: store.name,
        status: store.status,
        job_id: String(job._id),
      });
    },
  );

  // Retry a failed job
  app.post(
    '/api/v1/admin/pharmacies/:storeId/retry',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!requireSuperAdmin(request, reply)) return;
      const { storeId } = request.params as { storeId: string };
      const job = await retryJob(storeId);
      if (!job) return reply.status(404).send({ error: 'Not found' });
      return { store_id: storeId, status: job.status };
    },
  );
}
