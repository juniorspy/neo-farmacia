import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Redis from 'ioredis';
import type { AppConfig } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import { ProcessedCommand } from './processed.model.js';
import type { CommandRequest, CommandContext, CommandResult } from './types.js';
import { Store, type IStore } from '../provisioning/store.model.js';
import { getScopedOdoo } from '../../shared/odoo-scoped-cache.js';
import { n8nBearerOk } from '../../shared/n8n-auth.js';

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

  // Bearer check for n8n — fails CLOSED in production (no key = only open in
  // dev; the boot guard in config/env.ts guarantees the key exists in prod).
  async function verifyBearer(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    if (!config.n8n.apiKey && config.nodeEnv !== 'production') return true;
    if (n8nBearerOk(request.headers.authorization, config.n8n.apiKey)) return true;
    reply.status(401).send({ ok: false, error: 'unauthorized' });
    return false;
  }

  // POST /api/v1/commands
  app.post('/api/v1/commands', {
    schema: {
      summary: 'Despachador de comandos n8n (idempotente, scoped por farmacia)',
      description:
        'Auth: `Authorization: Bearer N8N_API_KEY`. Punto único de entrada de los agentes n8n. ' +
        'Idempotente por `commandId` (replay devuelve el resultado cacheado). Resuelve la farmacia ' +
        'y opera contra SU base Odoo.\n\n' +
        'Comandos: `usuario.lookupCombined`, `usuario.ensure`, `catalogo.search`, ' +
        '`pedido.updateItems`, `pedido.consultarPrecio`, `pedido.despachar`, `pedido.cancel`.\n\n' +
        'Respuesta: `{ ok: true, commandId, result }` — `result` depende del comando.',
      body: {
        type: 'object',
        required: ['command', 'commandId', 'storeId'],
        properties: {
          command: { type: 'string', description: 'Uno de los comandos listados arriba' },
          commandId: { type: 'string', description: 'ID único por invocación (idempotencia)' },
          storeId: { type: 'string' },
          chatId: { type: 'string' },
          usuarioId: { type: 'string' },
          payload: {
            type: 'object',
            additionalProperties: true,
            description: 'Argumentos específicos del comando',
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
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
