import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  fetchInstances,
  getConnectionState,
  getInstanceQr,
  createInstance,
  deleteInstance,
  logoutInstance,
} from '../evolution/evolution.client.js';
import { logger } from '../../shared/logger.js';

export async function whatsappRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/stores/:storeId/whatsapp/instances
  app.get('/api/v1/stores/:storeId/whatsapp/instances', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const instances = await fetchInstances();
      return (instances || []).map((inst: Record<string, unknown>) => ({
        id: inst.id || inst.instanceName,
        name: inst.instanceName,
        status: inst.connectionStatus || inst.state || 'unknown',
        number: inst.number || inst.owner || null,
      }));
    } catch (err) {
      logger.error({ err }, 'Failed to fetch WhatsApp instances');
      return reply.status(500).send({ error: 'Failed to fetch instances' });
    }
  });

  // GET /api/v1/stores/:storeId/whatsapp/instances/:name/status
  app.get('/api/v1/stores/:storeId/whatsapp/instances/:name/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { storeId: string; name: string };
    try {
      const state = await getConnectionState(name, '');
      return state;
    } catch (err) {
      logger.error({ err, name }, 'Failed to get instance status');
      return reply.status(500).send({ error: 'Failed to get status' });
    }
  });

  // GET /api/v1/stores/:storeId/whatsapp/instances/:name/qr
  app.get('/api/v1/stores/:storeId/whatsapp/instances/:name/qr', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { storeId: string; name: string };
    try {
      const qr = await getInstanceQr(name);
      return qr;
    } catch (err) {
      logger.error({ err, name }, 'Failed to get QR code');
      return reply.status(500).send({ error: 'Failed to get QR' });
    }
  });

  // POST /api/v1/stores/:storeId/whatsapp/instances
  app.post('/api/v1/stores/:storeId/whatsapp/instances', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.body as { name: string };
    if (!name) {
      return reply.status(400).send({ error: 'name required' });
    }
    try {
      const result = await createInstance(name);
      logger.info({ name }, 'WhatsApp instance created');
      return result;
    } catch (err) {
      logger.error({ err, name }, 'Failed to create instance');
      return reply.status(500).send({ error: 'Failed to create instance' });
    }
  });

  // DELETE /api/v1/stores/:storeId/whatsapp/instances/:name
  app.delete('/api/v1/stores/:storeId/whatsapp/instances/:name', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { storeId: string; name: string };
    try {
      await logoutInstance(name).catch(() => {});
      await deleteInstance(name);
      logger.info({ name }, 'WhatsApp instance deleted');
      return { success: true };
    } catch (err) {
      logger.error({ err, name }, 'Failed to delete instance');
      return reply.status(500).send({ error: 'Failed to delete instance' });
    }
  });
}
