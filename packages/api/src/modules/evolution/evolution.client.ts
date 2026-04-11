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

export interface CreateInstanceResult {
  instanceName: string;
  apiKey: string | null;
  qrCodeBase64: string | null;
  raw: unknown;
}

/**
 * Create a new Evolution instance with a pre-configured webhook pointing
 * at our api. Returns the per-instance apiKey (needed for sending messages)
 * and the QR code base64 (for the pharmacy owner to scan).
 */
export async function createInstance(
  instanceName: string,
  webhookUrl: string,
): Promise<CreateInstanceResult> {
  if (!config) throw new Error('Evolution not initialized');

  const res = await axios.post(
    `${config.apiUrl}/instance/create`,
    {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      // Configure the webhook at creation time so no second call is needed.
      // Evolution v2 accepts this shape; older versions may need a separate
      // /webhook/set/:instance call which we fall back to below.
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    },
    { headers: { apikey: config.masterKey }, timeout: 15000 },
  );

  // Evolution create response shape varies a bit by version. Try common paths.
  const data = res.data as Record<string, unknown>;
  const hash = (data.hash as Record<string, unknown>) || {};
  const qrcode = (data.qrcode as Record<string, unknown>) || {};
  const apiKey =
    (hash.apikey as string) ||
    (hash as unknown as string) || // some versions return hash as a string
    null;
  const qrCodeBase64 =
    (qrcode.base64 as string) ||
    (qrcode.code as string) ||
    (data.base64 as string) ||
    null;

  // Belt-and-suspenders: try to (re)set the webhook in case the creation
  // payload ignored it. Ignore failure — it may not be needed.
  try {
    await axios.post(
      `${config.apiUrl}/webhook/set/${instanceName}`,
      {
        webhook: {
          url: webhookUrl,
          enabled: true,
          byEvents: false,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        },
      },
      { headers: { apikey: apiKey || config.masterKey }, timeout: 5000 },
    );
  } catch (err) {
    logger.debug({ err, instanceName }, 'Secondary webhook/set call failed (may be redundant)');
  }

  logger.info(
    { instanceName, apiKeyPresent: !!apiKey, qrPresent: !!qrCodeBase64, webhookUrl },
    'Evolution instance created',
  );

  return { instanceName, apiKey, qrCodeBase64, raw: data };
}

/**
 * Fetch the current QR code for an instance that was created but not yet
 * scanned. Returns the same base64 shape as createInstance.
 */
export async function getInstanceQrBase64(
  instanceName: string,
  apiKey?: string,
): Promise<string | null> {
  if (!config) throw new Error('Evolution not initialized');
  try {
    const res = await axios.get(
      `${config.apiUrl}/instance/connect/${instanceName}`,
      { headers: { apikey: apiKey || config.masterKey }, timeout: 10000 },
    );
    const data = res.data as Record<string, unknown>;
    return (data.base64 as string) || (data.code as string) || null;
  } catch (err) {
    logger.warn({ err, instanceName }, 'getInstanceQrBase64 failed');
    return null;
  }
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
