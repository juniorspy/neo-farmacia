import mongoose from 'mongoose';
import { logger } from './logger.js';
import type { AppConfig } from '../config/env.js';

export async function connectMongo(config: AppConfig) {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));

  await mongoose.connect(config.mongo.uri);
}

export async function closeMongo() {
  await mongoose.disconnect();
}
