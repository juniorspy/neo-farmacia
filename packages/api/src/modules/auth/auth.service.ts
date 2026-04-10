import { Admin, type IAdmin } from './admin.model.js';
import { logger } from '../../shared/logger.js';

export async function findAdminByEmail(email: string): Promise<IAdmin | null> {
  return Admin.findOne({ email, active: true });
}

export async function findAdminById(id: string): Promise<IAdmin | null> {
  return Admin.findById(id).select('-password');
}

export async function createAdmin(data: {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'pharmacist';
  stores: Array<{ id: string; name: string }>;
}): Promise<IAdmin> {
  const admin = new Admin(data);
  await admin.save();
  logger.info({ email: data.email, role: data.role }, 'Admin created');
  return admin;
}

export async function seedDefaultAdmin(): Promise<void> {
  const count = await Admin.countDocuments();
  if (count > 0) return;

  await createAdmin({
    email: 'admin@leofarmacia.com',
    password: 'admin123',
    name: 'Administrador',
    role: 'admin',
    stores: [
      { id: 'store_leo', name: 'Farmacia Leo' },
    ],
  });
  logger.info('Default admin seeded: admin@leofarmacia.com / admin123');
}
