import mongoose, { Schema, type Document } from 'mongoose';

export interface IUser extends Document {
  store_id: string;
  chat_id: string;
  phone: string;
  name: string;
  address: string;
  registered: boolean;
  created_at: Date;
  updated_at: Date;
}

const userSchema = new Schema<IUser>({
  store_id: { type: String, required: true },
  chat_id: { type: String, required: true },
  phone: { type: String, required: true },
  name: { type: String, default: '' },
  address: { type: String, default: '' },
  registered: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

userSchema.index({ store_id: 1, chat_id: 1 }, { unique: true });
userSchema.index({ store_id: 1, phone: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
