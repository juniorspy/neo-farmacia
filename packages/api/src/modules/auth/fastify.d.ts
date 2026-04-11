import '@fastify/jwt';
import type { IStore } from '../provisioning/store.model.js';
import type { ScopedOdoo } from '../../shared/odoo-scoped.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    resolveStore: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    store: IStore;
    odoo: ScopedOdoo;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      role: string;
      stores?: Array<{ id: string; name: string }>;
    };
    user: {
      id: string;
      email: string;
      role: string;
      stores?: Array<{ id: string; name: string }>;
    };
  }
}
