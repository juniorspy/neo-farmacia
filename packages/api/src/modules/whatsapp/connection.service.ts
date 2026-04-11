import { randomBytes } from 'crypto';
import { logger } from '../../shared/logger.js';
import { Store } from '../provisioning/store.model.js';
import { WhatsappConnection, type IWhatsappConnection } from './connection.model.js';

/**
 * Generate a stable, collision-proof instance name for a new connection.
 * Pattern: nf_<store_id>_<6char>
 */
export function makeInstanceName(storeId: string): string {
  const suffix = randomBytes(3).toString('hex'); // 6 chars
  return `nf_${storeId}_${suffix}`;
}

/**
 * One-time migration: for any Store still carrying the old single-connection
 * fields (whatsapp_instance_id + apikey), materialize a WhatsappConnection
 * record and clear the legacy fields. Idempotent — safe to run on every boot.
 */
export async function migrateLegacyConnections(): Promise<number> {
  const stores = await Store.find({
    whatsapp_instance_id: { $ne: null, $exists: true },
  });

  let migrated = 0;
  for (const store of stores) {
    if (!store.whatsapp_instance_id) continue;

    const existing = await WhatsappConnection.findOne({
      instance_name: store.whatsapp_instance_id,
    });
    if (!existing) {
      await WhatsappConnection.create({
        store_id: store.store_id,
        label: 'Principal',
        instance_name: store.whatsapp_instance_id,
        instance_api_key: store.whatsapp_instance_api_key || null,
        number: store.whatsapp_number || null,
        state: store.whatsapp_number ? 'open' : 'qr',
        connected_at: store.whatsapp_number ? new Date() : null,
      });
      migrated += 1;
      logger.info(
        { storeId: store.store_id, instanceName: store.whatsapp_instance_id },
        'Migrated legacy single-connection to WhatsappConnection collection',
      );
    }

    // Clear the legacy fields so the migration doesn't run again on this doc
    await Store.updateOne(
      { store_id: store.store_id },
      {
        $set: {
          whatsapp_instance_id: null,
          whatsapp_instance_api_key: null,
          whatsapp_number: null,
        },
      },
    );
  }

  if (migrated > 0) {
    logger.info({ count: migrated }, 'Legacy whatsapp connection migration complete');
  }
  return migrated;
}

/** Find a connection by its Evolution instance name. */
export async function findConnectionByInstance(
  instanceName: string,
): Promise<IWhatsappConnection | null> {
  return WhatsappConnection.findOne({ instance_name: instanceName });
}

/** List all connections for a store. */
export async function listConnectionsForStore(
  storeId: string,
): Promise<IWhatsappConnection[]> {
  return WhatsappConnection.find({ store_id: storeId }).sort({ created_at: 1 });
}
