import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import {
  createInstance,
  deleteInstance,
  logoutInstance,
  getConnectionState,
  getInstanceQrBase64,
} from '../evolution/evolution.client.js';
import { WhatsappConnection } from './connection.model.js';
import {
  makeInstanceName,
  listConnectionsForStore,
} from './connection.service.js';
import { invalidateStoreResolverCache } from '../webhook/store-resolver.js';
import { logger } from '../../shared/logger.js';

/**
 * Multi-connection WhatsApp per store. Each pharmacy can have many lines
 * (e.g. "Caja", "Delivery", "Farmacéutico de guardia"). Each connection is
 * an independent Evolution instance with its own apiKey and state.
 */

function mapEvolutionState(state: string | undefined): 'qr' | 'connecting' | 'open' | 'close' | 'unknown' {
  switch (state) {
    case 'open':
    case 'connected':
      return 'open';
    case 'close':
    case 'disconnected':
    case 'logout':
      return 'close';
    case 'qr':
    case 'qrReadSuccess':
      return 'qr';
    case 'connecting':
      return 'connecting';
    default:
      return 'unknown';
  }
}

async function refreshConnectionState(
  instanceName: string,
  apiKey: string | null,
): Promise<{ state: ReturnType<typeof mapEvolutionState>; number: string | null }> {
  try {
    const res = await getConnectionState(instanceName, apiKey || '');
    const state = mapEvolutionState(
      ((res as Record<string, unknown>)?.instance as Record<string, unknown>)?.state as string,
    );
    const wuid =
      (((res as Record<string, unknown>)?.instance as Record<string, unknown>)?.wuid as string) || '';
    const number = wuid ? wuid.split('@')[0] : null;
    return { state, number };
  } catch (err) {
    logger.warn({ err, instanceName }, 'getConnectionState failed');
    return { state: 'unknown', number: null };
  }
}

export async function whatsappRoutes(
  app: FastifyInstance,
  opts: { config: AppConfig },
) {
  const { config } = opts;

  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  // ── LIST ──
  app.get(
    '/api/v1/stores/:storeId/whatsapp/connections',
    async (request: FastifyRequest) => {
      const store = request.store;
      const list = await listConnectionsForStore(store.store_id);
      return list.map((c) => ({
        id: String(c._id),
        label: c.label,
        instance_name: c.instance_name,
        number: c.number,
        state: c.state,
        created_at: c.created_at,
        connected_at: c.connected_at,
        disconnected_at: c.disconnected_at,
      }));
    },
  );

  // ── CREATE ──
  app.post(
    '/api/v1/stores/:storeId/whatsapp/connections',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const store = request.store;
      const body = request.body as { label?: string };
      const label = (body?.label || '').trim();
      if (!label) {
        return reply.status(400).send({ error: 'label required' });
      }
      if (label.length > 60) {
        return reply.status(400).send({ error: 'label too long (max 60)' });
      }

      const instanceName = makeInstanceName(store.store_id);
      const webhookUrl = `${config.apiPublicUrl}/webhook/evolution`;

      try {
        const created = await createInstance(instanceName, webhookUrl);

        const conn = await WhatsappConnection.create({
          store_id: store.store_id,
          label,
          instance_name: instanceName,
          instance_api_key: created.apiKey,
          state: 'qr',
        });

        invalidateStoreResolverCache(instanceName);

        let qr = created.qrCodeBase64;
        if (!qr) {
          qr = await getInstanceQrBase64(instanceName, created.apiKey || undefined);
        }

        return reply.status(201).send({
          id: String(conn._id),
          label: conn.label,
          instance_name: conn.instance_name,
          number: null,
          state: 'qr',
          qr_base64: qr,
        });
      } catch (err) {
        logger.error(
          { err, storeId: store.store_id, instanceName },
          'Failed to create WhatsApp connection',
        );
        return reply.status(500).send({ error: 'Failed to create connection' });
      }
    },
  );

  // ── REFRESH QR ──
  app.get(
    '/api/v1/stores/:storeId/whatsapp/connections/:id/qr',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const conn = await WhatsappConnection.findOne({
        _id: id,
        store_id: request.store.store_id,
      });
      if (!conn) return reply.status(404).send({ error: 'connection not found' });

      const qr = await getInstanceQrBase64(
        conn.instance_name,
        conn.instance_api_key || undefined,
      );
      return { qr_base64: qr };
    },
  );

  // ── REFRESH STATE ──
  app.get(
    '/api/v1/stores/:storeId/whatsapp/connections/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const conn = await WhatsappConnection.findOne({
        _id: id,
        store_id: request.store.store_id,
      });
      if (!conn) return reply.status(404).send({ error: 'connection not found' });

      const { state, number } = await refreshConnectionState(
        conn.instance_name,
        conn.instance_api_key,
      );
      const changed = state !== conn.state || (number && number !== conn.number);
      if (changed) {
        conn.state = state;
        if (number) conn.number = number;
        if (state === 'open' && !conn.connected_at) conn.connected_at = new Date();
        if (state === 'close') conn.disconnected_at = new Date();
        await conn.save();
        invalidateStoreResolverCache(conn.instance_name);
      }

      return {
        id: String(conn._id),
        label: conn.label,
        instance_name: conn.instance_name,
        number: conn.number,
        state: conn.state,
        connected_at: conn.connected_at,
        disconnected_at: conn.disconnected_at,
      };
    },
  );

  // ── DELETE (full removal: logout + Evolution delete + Mongo delete) ──
  //    This is the single destructive action. No reconnect — if the user
  //    wants to come back, they create a new connection and scan again.
  app.delete(
    '/api/v1/stores/:storeId/whatsapp/connections/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const conn = await WhatsappConnection.findOne({
        _id: id,
        store_id: request.store.store_id,
      });
      if (!conn) return reply.status(404).send({ error: 'connection not found' });

      const instanceName = conn.instance_name;
      try {
        await logoutInstance(instanceName).catch(() => {});
        await deleteInstance(instanceName);
      } catch (err) {
        logger.warn({ err, instanceName }, 'Evolution delete failed, removing record anyway');
      }
      await WhatsappConnection.deleteOne({ _id: conn._id });
      invalidateStoreResolverCache(instanceName);
      return { deleted: true };
    },
  );
}
