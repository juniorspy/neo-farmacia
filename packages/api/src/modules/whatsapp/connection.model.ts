import mongoose, { Schema, type Document } from 'mongoose';

/**
 * A WhatsApp line bound to a specific pharmacy. A store can have many of
 * these (e.g. "Main counter", "Delivery", "After-hours pharmacist").
 *
 * Lifecycle:
 *   created → open (connected) ↔ close (disconnected) → deleted
 */

export type ConnectionState =
  | 'qr' // instance created, waiting for QR scan
  | 'connecting'
  | 'open' // connected
  | 'close' // disconnected / logged out (session ended, record kept)
  | 'unknown';

export interface IWhatsappConnection extends Document {
  store_id: string;
  label: string; // user-provided, e.g. "Delivery"
  instance_name: string; // Evolution instance name, globally unique
  instance_api_key: string | null;
  number: string | null; // once connected, the bound phone number
  state: ConnectionState;
  created_at: Date;
  connected_at: Date | null;
  disconnected_at: Date | null;
  updated_at: Date;
}

const connectionSchema = new Schema<IWhatsappConnection>({
  store_id: { type: String, required: true, index: true },
  label: { type: String, required: true, trim: true, maxlength: 60 },
  instance_name: { type: String, required: true, unique: true, index: true },
  instance_api_key: { type: String, default: null },
  number: { type: String, default: null },
  state: {
    type: String,
    enum: ['qr', 'connecting', 'open', 'close', 'unknown'],
    default: 'qr',
  },
  created_at: { type: Date, default: Date.now },
  connected_at: { type: Date, default: null },
  disconnected_at: { type: Date, default: null },
  updated_at: { type: Date, default: Date.now },
});

connectionSchema.pre('save', function () {
  this.updated_at = new Date();
});

export const WhatsappConnection = mongoose.model<IWhatsappConnection>(
  'WhatsappConnection',
  connectionSchema,
);
