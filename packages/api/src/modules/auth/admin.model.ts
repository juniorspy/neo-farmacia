import mongoose, { Schema, type Document } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IAdmin extends Document {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'pharmacist';
  stores: Array<{ id: string; name: string }>;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const adminSchema = new Schema<IAdmin>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'pharmacist'], default: 'pharmacist' },
  stores: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
  }],
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

adminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
  this.updated_at = new Date();
});

adminSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const Admin = mongoose.model<IAdmin>('Admin', adminSchema);
