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
  // Per-pharmacy voice-call config — edited by super-admin (not env). The agent
  // worker reads these (via the LiveKit token metadata) to pick STT/LLM/TTS.
  voice_config: {
    enabled: boolean;
    language: string;
    stt_provider: string;
    stt_model: string;
    llm_provider: string;
    llm_model: string;
    tts_provider: string;
    tts_voice: string;
    // ElevenLabs expressiveness knobs (0-1). stability: low = expressive but
    // variable, high = consistent but flat. style: energy/expressiveness.
    tts_stability: number;
    tts_style: number;
    greeting: string;
    // System-prompt TEMPLATE for the voice agent — fully owned by the
    // super-admin (no hardcoded prompt in code). The backend fills the
    // {variables} with real per-call data at token-mint time.
    prompt_template: string;
  };
  // Deprecated single-connection fields — migrated into the WhatsappConnection
  // collection on api startup. Kept on the schema as nullable so existing docs
  // don't fail validation; will be removed in a future cleanup.
  whatsapp_instance_id: string | null;
  whatsapp_instance_api_key: string | null;
  whatsapp_number: string | null;
  odoo_admin_password_hash: string | null; // bcrypt hash of the initial admin pw, for reference
  status: StoreStatus;
  created_at: Date;
  updated_at: Date;
}

// Single source of truth for voice-config defaults. Used by the schema AND as
// a fallback for stores created before the field existed (`.lean()` reads
// don't apply schema defaults).
export const VOICE_CONFIG_DEFAULTS = {
  enabled: false,
  language: 'es',
  stt_provider: 'deepgram',
  stt_model: 'nova-3',
  llm_provider: 'openai',
  llm_model: 'gpt-4o-mini',
  tts_provider: 'openai',
  tts_voice: 'nova',
  tts_stability: 0.5,
  tts_style: 0.2,
  greeting: '',
  // Default prompt TEMPLATE — a starting point the super-admin fully owns and
  // edits in the UI. Available variables (filled per call by the backend):
  // {store_name} {agent_name} {reason} {customer_name} {customer_phone}
  // {recent_messages} {missing_fields} {language}
  prompt_template: [
    'Eres {agent_name}, asistente de voz de {store_name}, una farmacia. Hablas español dominicano, cálido y breve.',
    '',
    'Motivo de esta llamada: {reason}',
    'Cliente: {customer_name} ({customer_phone})',
    'Datos pendientes por confirmar: {missing_fields}',
    '',
    'Conversación reciente por WhatsApp:',
    '{recent_messages}',
    '',
    'Al contestar, saluda breve mencionando el motivo y ve directo a resolverlo — ya estás en contexto, NO empieces de cero.',
    'ALCANCE: SOLO aclaras y recoges datos faltantes (dirección, confirmación de productos, receta). NO modificas el pedido por voz, NO confirmas compras, NO tomas pagos.',
    'SEGURIDAD: NO das consejo clínico ni de dosis, NO recomiendas tratamientos, NO confirmas medicamentos controlados; si lo piden, di con tacto que eso lo revisa el farmacéutico por WhatsApp.',
    'Para buscar productos del catálogo usa la herramienta search_product.',
    'Al terminar, resume lo confirmado y di que el farmacéutico continúa por WhatsApp.',
  ].join('\n'),
};

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
  voice_config: {
    enabled: { type: Boolean, default: VOICE_CONFIG_DEFAULTS.enabled },
    language: { type: String, default: VOICE_CONFIG_DEFAULTS.language },
    stt_provider: { type: String, default: VOICE_CONFIG_DEFAULTS.stt_provider },
    stt_model: { type: String, default: VOICE_CONFIG_DEFAULTS.stt_model },
    llm_provider: { type: String, default: VOICE_CONFIG_DEFAULTS.llm_provider },
    llm_model: { type: String, default: VOICE_CONFIG_DEFAULTS.llm_model },
    tts_provider: { type: String, default: VOICE_CONFIG_DEFAULTS.tts_provider },
    tts_voice: { type: String, default: VOICE_CONFIG_DEFAULTS.tts_voice },
    tts_stability: { type: Number, default: VOICE_CONFIG_DEFAULTS.tts_stability, min: 0, max: 1 },
    tts_style: { type: Number, default: VOICE_CONFIG_DEFAULTS.tts_style, min: 0, max: 1 },
    greeting: { type: String, default: VOICE_CONFIG_DEFAULTS.greeting, maxlength: 300 },
    prompt_template: {
      type: String,
      default: VOICE_CONFIG_DEFAULTS.prompt_template,
      maxlength: 6000,
    },
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
