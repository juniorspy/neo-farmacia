import type { IStore } from '../provisioning/store.model.js';

/**
 * Per-store agent config payload sent to n8n so the agents can personalize
 * replies without owning per-tenant prompts. Shared by the chat webhook
 * pipeline and order-event notifications — one shape, one place.
 */
export function buildAgentStoreConfig(store: IStore) {
  return {
    store_id: store.store_id,
    name: store.name,
    currency: store.currency,
    timezone: store.timezone,
    lang: store.lang,
    agent: {
      name: store.agent_config?.agent_name || 'Sofía',
      greeting_style: store.agent_config?.greeting_style || 'amigable',
      signature: store.agent_config?.signature || `— ${store.name}`,
      business_hours: store.agent_config?.business_hours || '',
      delivery_info: store.agent_config?.delivery_info || '',
      custom_notes: store.agent_config?.custom_notes || '',
    },
  };
}
