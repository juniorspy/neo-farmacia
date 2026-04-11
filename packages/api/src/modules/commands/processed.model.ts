import mongoose, { Schema, type Document } from 'mongoose';

export interface IProcessedCommand extends Document {
  command_id: string;
  command: string;
  store_id: string;
  result: Record<string, unknown>;
  processed_at: Date;
}

const processedSchema = new Schema<IProcessedCommand>({
  command_id: { type: String, required: true, unique: true },
  command: { type: String, required: true },
  store_id: { type: String, required: true },
  result: { type: Schema.Types.Mixed, default: {} },
  processed_at: { type: Date, default: Date.now, expires: 86400 }, // 24h TTL
});

processedSchema.index({ store_id: 1, command_id: 1 });

export const ProcessedCommand = mongoose.model<IProcessedCommand>('ProcessedCommand', processedSchema);
