import axios from 'axios';
import { logger } from '../../shared/logger.js';
import type { AppConfig } from '../../config/env.js';

let config: AppConfig['evolution'] | null = null;

export function initEvolution(appConfig: AppConfig) {
  config = appConfig.evolution;
}

export async function sendText(instanceName: string, apiKey: string, number: string, text: string) {
  if (!config) throw new Error('Evolution not initialized');

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(
        `${config.apiUrl}/message/sendText/${instanceName}`,
        { number, text },
        { headers: { apikey: apiKey }, timeout: 10000 },
      );
      return res.data;
    } catch (err) {
      if (attempt === 3) throw err;
      const delay = attempt * 1000;
      logger.warn({ attempt, delay, instanceName }, 'Retry sending message');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function sendTyping(instanceName: string, apiKey: string, remoteJid: string) {
  if (!config) throw new Error('Evolution not initialized');

  try {
    await axios.post(
      `${config.apiUrl}/chat/updatePresence/${instanceName}`,
      { remoteJid, presence: 'composing' },
      { headers: { apikey: apiKey }, timeout: 5000 },
    );
  } catch (err) {
    logger.warn({ err, instanceName }, 'Failed to send typing indicator');
  }
}

export async function getConnectionState(instanceName: string, apiKey: string) {
  if (!config) throw new Error('Evolution not initialized');

  const res = await axios.get(
    `${config.apiUrl}/instance/connectionState/${instanceName}`,
    { headers: { apikey: apiKey }, timeout: 5000 },
  );
  return res.data;
}

export async function fetchInstances() {
  if (!config) throw new Error('Evolution not initialized');

  const res = await axios.get(
    `${config.apiUrl}/instance/fetchInstances`,
    { headers: { apikey: config.masterKey }, timeout: 10000 },
  );
  return res.data;
}

export async function getInstanceQr(instanceName: string) {
  if (!config) throw new Error('Evolution not initialized');

  const res = await axios.get(
    `${config.apiUrl}/instance/connect/${instanceName}`,
    { headers: { apikey: config.masterKey }, timeout: 10000 },
  );
  return res.data;
}

export async function createInstance(instanceName: string) {
  if (!config) throw new Error('Evolution not initialized');

  const res = await axios.post(
    `${config.apiUrl}/instance/create`,
    {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    },
    { headers: { apikey: config.masterKey }, timeout: 10000 },
  );
  return res.data;
}

export async function deleteInstance(instanceName: string) {
  if (!config) throw new Error('Evolution not initialized');

  const res = await axios.delete(
    `${config.apiUrl}/instance/delete/${instanceName}`,
    { headers: { apikey: config.masterKey }, timeout: 10000 },
  );
  return res.data;
}

export async function logoutInstance(instanceName: string) {
  if (!config) throw new Error('Evolution not initialized');

  const res = await axios.delete(
    `${config.apiUrl}/instance/logout/${instanceName}`,
    { headers: { apikey: config.masterKey }, timeout: 10000 },
  );
  return res.data;
}
