import mongoose, { Schema, type Document } from 'mongoose';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IStepState {
  name: string;
  status: StepStatus;
  started_at?: Date;
  finished_at?: Date;
  error?: string | null;
  data?: Record<string, unknown>;
}

export interface IProvisioningJob extends Document {
  store_id: string;
  status: JobStatus;
  steps: IStepState[];
  current_step_index: number;
  attempt: number;
  last_error: string | null;
  locked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const stepStateSchema = new Schema<IStepState>(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
    started_at: { type: Date },
    finished_at: { type: Date },
    error: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const provisioningJobSchema = new Schema<IProvisioningJob>({
  store_id: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  steps: { type: [stepStateSchema], default: [] },
  current_step_index: { type: Number, default: 0 },
  attempt: { type: Number, default: 0 },
  last_error: { type: String, default: null },
  locked_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

provisioningJobSchema.pre('save', function () {
  this.updated_at = new Date();
});

export const ProvisioningJob = mongoose.model<IProvisioningJob>(
  'ProvisioningJob',
  provisioningJobSchema,
);
