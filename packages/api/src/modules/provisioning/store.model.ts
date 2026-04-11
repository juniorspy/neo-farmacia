import mongoose, { Schema, type Document } from 'mongoose';

export type StoreStatus = 'pending' | 'provisioning' | 'active' | 'failed' | 'suspended';

export interface IStore extends Document {
  store_id: string; // public opaque id (also used as slug for odoo_db)
  name: string;
  owner_name: string;
  owner_email: string;
  owner_phone?: string;
  timezone: string;
  currency: string;
  country_code: string;
  lang: string;
  odoo_db: string; // name of the dedicated Odoo database
  meilisearch_index: string;
  agent_config: {
    agent_name: string;
    greeting_style: 'formal' | 'casual' | 'amigable';
    signature: string;
    business_hours: string;
    delivery_info: string;
    custom_notes: string;
  };
  whatsapp_instance_id: string | null;
  whatsapp_instance_api_key: string | null; // per-instance Evolution apiKey (for sending replies)
  whatsapp_number: string | null; // the phone number once connected (e.g. "18091234567")
  odoo_admin_password_hash: string | null; // bcrypt hash of the initial admin pw, for reference
  status: StoreStatus;
  created_at: Date;
  updated_at: Date;
}

const storeSchema = new Schema<IStore>({
  store_id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  owner_name: { type: String, required: true },
  owner_email: { type: String, required: true, lowercase: true, trim: true },
  owner_phone: { type: String },
  timezone: { type: String, default: 'America/Santo_Domingo' },
  currency: { type: String, default: 'DOP' },
  country_code: { type: String, default: 'DO' },
  lang: { type: String, default: 'es_DO' },
  odoo_db: { type: String, required: true, unique: true },
  meilisearch_index: { type: String, required: true },
  agent_config: {
    agent_name: { type: String, default: 'Sofía' },
    greeting_style: { type: String, enum: ['formal', 'casual', 'amigable'], default: 'amigable' },
    signature: { type: String, default: '' },
    business_hours: { type: String, default: 'Lun-Sáb 8:00-22:00' },
    delivery_info: { type: String, default: '' },
    custom_notes: { type: String, default: '', maxlength: 500 },
  },
  whatsapp_instance_id: { type: String, default: null, index: true },
  whatsapp_instance_api_key: { type: String, default: null },
  whatsapp_number: { type: String, default: null },
  odoo_admin_password_hash: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'provisioning', 'active', 'failed', 'suspended'],
    default: 'pending',
    index: true,
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

storeSchema.pre('save', function () {
  this.updated_at = new Date();
});

export const Store = mongoose.model<IStore>('Store', storeSchema);
