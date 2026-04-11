import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { ProcessedCommand } from './processed.model.js';
import type { CommandRequest, CommandContext, CommandResult } from './types.js';
import { Store, type IStore } from '../provisioning/store.model.js';
import { getScopedOdoo } from '../../shared/odoo-scoped-cache.js';

import { usuarioLookupCombined, usuarioEnsure } from './handlers/usuario.handler.js';
import { catalogoSearch } from './handlers/catalogo.handler.js';
import {
  pedidoUpdateItems,
  pedidoConsultarPrecio,
  pedidoDespachar,
  pedidoCancel,
} from './handlers/pedido.handler.js';

export async function commandsRoutes(
  app: FastifyInstance,
  opts: { redis: Redis; config: AppConfig },
) {
  const { redis, config } = opts;

  // Shared bearer check for n8n
  async function verifyBearer(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const auth = request.headers.authorization;
    const expected = config.n8n.apiKey;
    if (!expected) return true; // No key configured = open (dev mode)
    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== expected) {
      reply.status(401).send({ ok: false, error: 'unauthorized' });
      return false;
    }
    return true;
  }

  // POST /api/v1/commands
  app.post('/api/v1/commands', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await verifyBearer(request, reply))) return;

    const body = request.body as Partial<CommandRequest>;
    const { command, commandId, storeId, chatId, usuarioId, payload } = body;

    if (!command || !commandId || !storeId) {
      return reply.status(400).send({ ok: false, error: 'command, commandId, storeId required' });
    }

    // Idempotency check
    const existing = await ProcessedCommand.findOne({ command_id: commandId }).lean();
    if (existing) {
      logger.info({ commandId, command }, 'Idempotent replay, returning cached result');
      return { ok: true, commandId, result: existing.result, message: 'already-processed' };
    }

    // Resolve the store and attach a scoped Odoo client for this command.
    const store = await Store.findOne({ store_id: storeId }).lean<IStore>();
    if (!store) {
      return reply.status(404).send({ ok: false, error: `store ${storeId} not found` });
    }
    if (store.status !== 'active') {
      return reply
        .status(409)
        .send({ ok: false, error: `store ${storeId} is ${store.status}, not active` });
    }
    const odoo = getScopedOdoo(config, store.odoo_db);

    const ctx: CommandContext = {
      command,
      commandId,
      storeId,
      chatId,
      usuarioId,
      payload: payload || {},
      store,
      odoo,
    };

    logger.info({ command, commandId, storeId, chatId }, 'Command received');

    // Router
    let result: CommandResult;
    try {
      switch (command) {
        case 'usuario.lookupCombined':
          result = await usuarioLookupCombined(ctx);
          break;
        case 'usuario.ensure':
          result = await usuarioEnsure(ctx);
          break;
        case 'catalogo.search':
          result = await catalogoSearch(ctx, { redis, config });
          break;
        case 'pedido.updateItems':
          result = await pedidoUpdateItems(ctx);
          break;
        case 'pedido.consultarPrecio':
          result = await pedidoConsultarPrecio(ctx);
          break;
        case 'pedido.despachar':
          result = await pedidoDespachar(ctx);
          break;
        case 'pedido.cancel':
          result = await pedidoCancel(ctx);
          break;
        default:
          return reply.status(400).send({ ok: false, error: `unknown command: ${command}` });
      }
    } catch (err) {
      logger.error({ err, command, commandId }, 'Command handler threw');
      return reply.status(500).send({ ok: false, error: 'internal error' });
    }

    if (!result.ok) {
      return reply.status(400).send({ ok: false, commandId, error: result.error });
    }

    // Persist for idempotency
    try {
      await ProcessedCommand.create({
        command_id: commandId,
        command,
        store_id: storeId,
        result: result.result || {},
      });
    } catch (err) {
      // Ignore duplicate key errors — another request won the race
      const mongoErr = err as { code?: number };
      if (mongoErr.code !== 11000) {
        logger.warn({ err, commandId }, 'Failed to persist processed command');
      }
    }

    return { ok: true, commandId, result: result.result };
  });
}
