import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Store } from '../provisioning/store.model.js';
import { invalidateStoreResolverCache } from '../webhook/store-resolver.js';

/**
 * Endpoints that let a pharmacist edit their own store's config,
 * or let a super-admin edit any store. Scoped by request.store which
 * the resolveStore preHandler populates + authorizes.
 */

interface AgentConfigUpdate {
  agent_name?: string;
  greeting_style?: 'formal' | 'casual' | 'amigable';
  signature?: string;
  business_hours?: string;
  delivery_info?: string;
  custom_notes?: string;
}

const MAX_STRING = 200;
const MAX_NOTES = 500;

export async function storesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  // GET /api/v1/stores/:storeId — basic store info + agent config
  app.get(
    '/api/v1/stores/:storeId',
    async (request: FastifyRequest) => {
      const s = request.store;
      return {
        store_id: s.store_id,
        name: s.name,
        owner_name: s.owner_name,
        owner_email: s.owner_email,
        timezone: s.timezone,
        currency: s.currency,
        country_code: s.country_code,
        lang: s.lang,
        whatsapp_instance_id: s.whatsapp_instance_id,
        agent_config: s.agent_config,
        status: s.status,
      };
    },
  );

  // PATCH /api/v1/stores/:storeId/agent-config — edit agent persona/tone
  app.patch(
    '/api/v1/stores/:storeId/agent-config',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as AgentConfigUpdate;

      // Validate lengths
      const strFields: Array<keyof AgentConfigUpdate> = [
        'agent_name',
        'signature',
        'business_hours',
        'delivery_info',
      ];
      for (const f of strFields) {
        if (body[f] !== undefined && (body[f] as string).length > MAX_STRING) {
          return reply
            .status(400)
            .send({ error: `${f} too long (max ${MAX_STRING})` });
        }
      }
      if (body.custom_notes !== undefined && body.custom_notes.length > MAX_NOTES) {
        return reply.status(400).send({ error: `custom_notes too long (max ${MAX_NOTES})` });
      }
      if (
        body.greeting_style !== undefined &&
        !['formal', 'casual', 'amigable'].includes(body.greeting_style)
      ) {
        return reply.status(400).send({ error: 'greeting_style invalid' });
      }

      // Apply
      const storeId = request.store.store_id;
      const update: Record<string, unknown> = {};
      for (const f of [
        'agent_name',
        'greeting_style',
        'signature',
        'business_hours',
        'delivery_info',
        'custom_notes',
      ] as const) {
        if (body[f] !== undefined) update[`agent_config.${f}`] = body[f];
      }
      update.updated_at = new Date();

      const updated = await Store.findOneAndUpdate(
        { store_id: storeId },
        { $set: update },
        { new: true },
      );
      if (!updated) return reply.status(404).send({ error: 'store not found' });

      // Invalidate resolver cache so webhook picks up the new config on next message
      if (updated.whatsapp_instance_id) {
        invalidateStoreResolverCache(updated.whatsapp_instance_id);
      }

      return { ok: true, agent_config: updated.agent_config };
    },
  );
}
