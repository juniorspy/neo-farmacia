import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { findAdminByEmail, findAdminById } from './auth.service.js';

export async function authRoutes(
  app: FastifyInstance,
  opts: { config: AppConfig },
) {
  const { config } = opts;

  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password required' });
    }

    const admin = await findAdminByEmail(email);
    if (!admin) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await admin.comparePassword(password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign(
      {
        id: String(admin._id),
        email: admin.email,
        role: admin.role,
        // Include stores so resolveStore can authorize pharmacist-role users
        // against their own stores without an extra DB lookup per request.
        stores: admin.stores.map((s) => ({ id: s.id, name: s.name })),
      },
      { expiresIn: config.jwt.expiration },
    );

    return {
      token,
      user: {
        id: String(admin._id),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        stores: admin.stores,
      },
    };
  });

  // GET /api/v1/auth/me
  app.get('/api/v1/auth/me', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.user as { id: string };
    const admin = await findAdminById(id);

    if (!admin) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      stores: admin.stores,
    };
  });
}
