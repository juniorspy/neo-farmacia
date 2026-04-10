import mongoose, { Schema, type Document } from 'mongoose';

export interface IMessage extends Document {
  store_id: string;
  chat_id: string;
  message_id: string;
  direction: 'inbound' | 'outbound';
  text: string;
  sender: 'customer' | 'bot' | 'agent';
  timestamp: Date;
  meta: {
    phone?: string;
    pushName?: string;
    source?: string;
    instanceName?: string;
    messageType?: string;
  };
}

const messageSchema = new Schema<IMessage>({
  store_id: { type: String, required: true, index: true },
  chat_id: { type: String, required: true },
  message_id: { type: String, required: true, unique: true },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  text: { type: String, required: true },
  sender: { type: String, enum: ['customer', 'bot', 'agent'], required: true },
  timestamp: { type: Date, required: true, default: Date.now },
  meta: {
    phone: String,
    pushName: String,
    source: String,
    instanceName: String,
    messageType: String,
  },
});

messageSchema.index({ store_id: 1, chat_id: 1, timestamp: -1 });
messageSchema.index({ store_id: 1, timestamp: -1 });

export const Message = mongoose.model<IMessage>('Message', messageSchema);
