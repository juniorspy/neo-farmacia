import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Store, VOICE_CONFIG_DEFAULTS } from '../provisioning/store.model.js';
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

interface VoiceConfigUpdate {
  enabled?: boolean;
  language?: string;
  stt_provider?: string;
  stt_model?: string;
  llm_provider?: string;
  llm_model?: string;
  tts_provider?: string;
  tts_voice?: string;
  tts_stability?: number;
  tts_style?: number;
  greeting?: string;
  prompt_template?: string;
}

const MAX_STRING = 200;
const MAX_NOTES = 500;

// Allowed provider values for the per-pharmacy voice config.
const VOICE_ENUMS: Record<string, string[]> = {
  stt_provider: ['deepgram'],
  llm_provider: ['openai', 'anthropic'],
  tts_provider: ['openai', 'elevenlabs', 'cartesia', 'google'],
};


export async function storesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  // GET /api/v1/stores/:storeId — basic store info + agent config
  app.get(
    '/api/v1/stores/:storeId',
    {
      schema: {
        summary: 'Config de la farmacia (agente, voz, impresión)',
        description:
          'Auth: JWT (scoped — el farmacéutico ve solo sus stores; super-admin todas).\n\n' +
          'Respuesta: `{ store_id, name, owner_*, timezone, currency, agent_config, ' +
          'voice_config (con defaults), print_mode, status }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
      },
    },
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
        // Merge defaults so stores saved before newer fields (e.g.
        // prompt_template) existed still expose them in the UI.
        voice_config: { ...VOICE_CONFIG_DEFAULTS, ...(s.voice_config ?? {}) },
        print_mode: s.print_mode || 'manual',
        status: s.status,
      };
    },
  );

  // PATCH /api/v1/stores/:storeId/print-config — pharmacy-owned printing mode
  app.patch(
    '/api/v1/stores/:storeId/print-config',
    {
      schema: {
        summary: 'Modo de impresión de la farmacia (decisión del dueño)',
        description:
          'Auth: JWT (scoped). `manual` = botón por pedido · `auto` = imprime pedidos nuevos ' +
          '(pestaña pedidos abierta + impresora BT) · `off` = imprime su POS (nivel 2).\n\n' +
          'Respuesta: `{ ok, print_mode }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['print_mode'],
          properties: {
            print_mode: { type: 'string', enum: ['manual', 'auto', 'off'] },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { print_mode } = (request.body || {}) as { print_mode?: string };
      if (!print_mode || !['manual', 'auto', 'off'].includes(print_mode)) {
        return reply.status(400).send({ error: 'print_mode must be manual | auto | off' });
      }
      const { storeId } = request.params as { storeId: string };
      const updated = await Store.findOneAndUpdate(
        { store_id: storeId },
        { $set: { print_mode, updated_at: new Date() } },
        { returnDocument: 'after' },
      );
      if (!updated) return reply.status(404).send({ error: 'store not found' });
      return { ok: true, print_mode: updated.print_mode };
    },
  );

  // PATCH /api/v1/stores/:storeId/agent-config — edit agent persona/tone
  app.patch(
    '/api/v1/stores/:storeId/agent-config',
    {
      schema: {
        summary: 'Editar persona del agente IA ("Mi Agente")',
        description:
          'Auth: JWT (scoped). Solo se actualizan los campos enviados. El webhook recoge ' +
          'el cambio en el siguiente mensaje (cache invalidado).\n\n' +
          'Respuesta: `{ ok, agent_config }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            agent_name: { type: 'string', maxLength: 200 },
            greeting_style: { type: 'string', enum: ['formal', 'casual', 'amigable'] },
            signature: { type: 'string', maxLength: 200 },
            business_hours: { type: 'string', maxLength: 200 },
            delivery_info: { type: 'string', maxLength: 200 },
            custom_notes: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
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
        { returnDocument: 'after' },
      );
      if (!updated) return reply.status(404).send({ error: 'store not found' });

      // Invalidate resolver cache so webhook picks up the new config on next message
      if (updated.whatsapp_instance_id) {
        invalidateStoreResolverCache(updated.whatsapp_instance_id);
      }

      return { ok: true, agent_config: updated.agent_config };
    },
  );

  // PATCH /api/v1/stores/:storeId/voice-config — SUPER-ADMIN only.
  // Voice provider/voice selection is a platform setting, not a pharmacist one.
  app.patch(
    '/api/v1/stores/:storeId/voice-config',
    {
      schema: {
        summary: 'Config de voz de la farmacia (solo super-admin)',
        description:
          'Auth: JWT role=admin. Pipeline STT → LLM → TTS por farmacia. ' +
          '`applyToAll: true` aplica los campos enviados a TODAS las farmacias.\n\n' +
          'Respuesta: `{ ok, voice_config }` o `{ ok, applied_to_all, modified }`.',
        params: {
          type: 'object',
          properties: { storeId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            language: { type: 'string', maxLength: 200 },
            stt_provider: { type: 'string', enum: ['deepgram'] },
            stt_model: { type: 'string', maxLength: 200 },
            llm_provider: { type: 'string', enum: ['openai', 'anthropic'] },
            llm_model: { type: 'string', maxLength: 200 },
            tts_provider: { type: 'string', enum: ['openai', 'elevenlabs', 'cartesia', 'google'] },
            tts_voice: { type: 'string', maxLength: 200 },
            tts_stability: { type: 'number', minimum: 0, maximum: 1 },
            tts_style: { type: 'number', minimum: 0, maximum: 1 },
            greeting: { type: 'string', maxLength: 300 },
            prompt_template: { type: 'string', maxLength: 6000 },
            applyToAll: { type: 'boolean' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { role?: string } | undefined;
      if (user?.role !== 'admin') {
        return reply.status(403).send({ error: 'super-admin only' });
      }
      const body = request.body as VoiceConfigUpdate;

      // Validate provider enums.
      for (const f of ['stt_provider', 'llm_provider', 'tts_provider'] as const) {
        const v = body[f];
        if (v !== undefined && !VOICE_ENUMS[f].includes(v)) {
          return reply.status(400).send({ error: `${f} invalid` });
        }
      }
      // Validate lengths.
      for (const f of ['language', 'stt_model', 'llm_model', 'tts_voice'] as const) {
        const v = body[f];
        if (v !== undefined && v.length > MAX_STRING) {
          return reply.status(400).send({ error: `${f} too long (max ${MAX_STRING})` });
        }
      }
      if (body.greeting !== undefined && body.greeting.length > 300) {
        return reply.status(400).send({ error: 'greeting too long (max 300)' });
      }
      if (body.prompt_template !== undefined && body.prompt_template.length > 6000) {
        return reply.status(400).send({ error: 'prompt_template too long (max 6000)' });
      }
      for (const f of ['tts_stability', 'tts_style'] as const) {
        const v = body[f];
        if (v !== undefined && (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1)) {
          return reply.status(400).send({ error: `${f} must be a number between 0 and 1` });
        }
      }

      const storeId = request.store.store_id;
      const update: Record<string, unknown> = {};
      for (const f of [
        'enabled',
        'language',
        'stt_provider',
        'stt_model',
        'llm_provider',
        'llm_model',
        'tts_provider',
        'tts_voice',
        'tts_stability',
        'tts_style',
        'greeting',
        'prompt_template',
      ] as const) {
        if (body[f] !== undefined) update[`voice_config.${f}`] = body[f];
      }
      update.updated_at = new Date();

      // "Apply to all" — set this config as the default across every pharmacy.
      // A pharmacy can still be given its own voice later (single-store save).
      const applyToAll = (request.body as { applyToAll?: boolean }).applyToAll === true;
      if (applyToAll) {
        const res = await Store.updateMany({}, { $set: update });
        invalidateStoreResolverCache(); // no arg → clear the whole resolver cache
        return { ok: true, applied_to_all: true, modified: res.modifiedCount };
      }

      const updated = await Store.findOneAndUpdate(
        { store_id: storeId },
        { $set: update },
        { returnDocument: 'after' },
      );
      if (!updated) return reply.status(404).send({ error: 'store not found' });

      if (updated.whatsapp_instance_id) {
        invalidateStoreResolverCache(updated.whatsapp_instance_id);
      }

      return { ok: true, voice_config: updated.voice_config };
    },
  );
}
