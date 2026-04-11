import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import {
  createInstance,
  deleteInstance,
  logoutInstance,
  getConnectionState,
  getInstanceQrBase64,
} from '../evolution/evolution.client.js';
import { Store } from '../provisioning/store.model.js';
import { invalidateStoreResolverCache } from '../webhook/store-resolver.js';
import { logger } from '../../shared/logger.js';

/**
 * One primary WhatsApp connection per store. The store's instance name is
 * derived from store_id to keep it stable and human-readable. The per-instance
 * apiKey from Evolution is persisted on the Store so the webhook handler can
 * send replies back through it.
 *
 * Legacy note: old code used "instancia"; UI and responses now use "conexion".
 */

function instanceNameForStore(storeId: string): string {
  // Evolution accepts alphanumeric + dash + underscore. Our store_ids already
  // conform. Prefix to make it obvious this belongs to us in the Evolution UI.
  return `nf_${storeId}`;
}

export async function whatsappRoutes(
  app: FastifyInstance,
  opts: { config: AppConfig },
) {
  const { config } = opts;

  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.resolveStore);

  /**
   * GET /api/v1/stores/:storeId/whatsapp/connection
   * Returns the store's current WhatsApp binding + connection state.
   * If no connection is bound yet, returns { bound: false }.
   */
  app.get(
    '/api/v1/stores/:storeId/whatsapp/connection',
    async (request: FastifyRequest) => {
      const store = request.store;
      if (!store.whatsapp_instance_id) {
        return { bound: false };
      }

      let state: string = 'unknown';
      let number: string | null = store.whatsapp_number;
      try {
        const res = await getConnectionState(
          store.whatsapp_instance_id,
          store.whatsapp_instance_api_key || '',
        );
        state =
          (res?.instance?.state as string) ||
          (res?.state as string) ||
          'unknown';
        // Some Evolution versions return the connected number here
        const maybeNumber = (res?.instance?.wuid as string) || '';
        if (maybeNumber && !number) {
          number = maybeNumber.split('@')[0] || null;
        }
      } catch (err) {
        logger.warn({ err, storeId: store.store_id }, 'getConnectionState failed');
      }

      // Persist any newly detected number
      if (number && number !== store.whatsapp_number) {
        await Store.updateOne(
          { store_id: store.store_id },
          { $set: { whatsapp_number: number } },
        );
      }

      return {
        bound: true,
        instance_name: store.whatsapp_instance_id,
        number,
        state,
      };
    },
  );

  /**
   * POST /api/v1/stores/:storeId/whatsapp/connection
   * Create a new Evolution instance for this store. Returns the QR code
   * base64 so the UI can display it. If the store already has a connection,
   * returns 409 — caller must disconnect first.
   */
  app.post(
    '/api/v1/stores/:storeId/whatsapp/connection',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const store = request.store;

      if (store.whatsapp_instance_id) {
        return reply.status(409).send({
          error: 'already bound',
          hint: 'DELETE /connection first to create a new one',
          instance_name: store.whatsapp_instance_id,
        });
      }

      const instanceName = instanceNameForStore(store.store_id);
      const webhookUrl = `${config.apiPublicUrl}/webhook/evolution`;

      try {
        const created = await createInstance(instanceName, webhookUrl);

        // Persist on the Store so the webhook can route back here and so the
        // reply sender has the apiKey.
        await Store.updateOne(
          { store_id: store.store_id },
          {
            $set: {
              whatsapp_instance_id: instanceName,
              whatsapp_instance_api_key: created.apiKey,
              whatsapp_number: null,
            },
          },
        );
        invalidateStoreResolverCache(instanceName);

        // If the create response didn't include a QR, fetch one separately.
        let qr = created.qrCodeBase64;
        if (!qr) {
          qr = await getInstanceQrBase64(instanceName, created.apiKey || undefined);
        }

        return reply.status(201).send({
          bound: true,
          instance_name: instanceName,
          qr_base64: qr,
          state: 'qr',
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

  /**
   * GET /api/v1/stores/:storeId/whatsapp/connection/qr
   * Refresh the QR code for a connection that hasn't been scanned yet.
   * Evolution QR codes expire after ~60 seconds; the UI polls this while
   * the scan flow is active.
   */
  app.get(
    '/api/v1/stores/:storeId/whatsapp/connection/qr',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const store = request.store;
      if (!store.whatsapp_instance_id) {
        return reply.status(404).send({ error: 'no connection bound' });
      }
      const qr = await getInstanceQrBase64(
        store.whatsapp_instance_id,
        store.whatsapp_instance_api_key || undefined,
      );
      return { qr_base64: qr };
    },
  );

  /**
   * DELETE /api/v1/stores/:storeId/whatsapp/connection
   * Logout + delete the Evolution instance, clear the Store binding.
   */
  app.delete(
    '/api/v1/stores/:storeId/whatsapp/connection',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const store = request.store;
      if (!store.whatsapp_instance_id) {
        return reply.status(404).send({ error: 'no connection to delete' });
      }
      const instanceName = store.whatsapp_instance_id;
      try {
        await logoutInstance(instanceName).catch(() => {
          /* may already be disconnected */
        });
        await deleteInstance(instanceName).catch((err) => {
          logger.warn({ err, instanceName }, 'Evolution delete failed, clearing binding anyway');
        });
      } finally {
        await Store.updateOne(
          { store_id: store.store_id },
          {
            $set: {
              whatsapp_instance_id: null,
              whatsapp_instance_api_key: null,
              whatsapp_number: null,
            },
          },
        );
        invalidateStoreResolverCache(instanceName);
      }
      return { deleted: true };
    },
  );
}
