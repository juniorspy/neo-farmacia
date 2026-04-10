import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import type { AppConfig } from '../../config/env.js';

export async function registerJwt(app: FastifyInstance, config: AppConfig) {
  await app.register(fastifyJwt, {
    secret: config.jwt.secret,
  });

  // Decorator: app.authenticate — use as preHandler on protected routes
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
}
