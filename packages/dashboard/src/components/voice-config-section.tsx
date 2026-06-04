"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Mic, Check, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Super-admin editor for a pharmacy's voice config (per-pharmacy, not env).
 * The agent worker reads these (via the LiveKit token metadata) to pick
 * STT/LLM/TTS. API keys live on the server — only selections are edited here.
 */

interface VoiceConfig {
  enabled: boolean;
  language: string;
  stt_provider: string;
  stt_model: string;
  llm_provider: string;
  llm_model: string;
  tts_provider: string;
  tts_voice: string;
  tts_stability: number;
  tts_style: number;
  greeting: string;
  prompt_template: string;
}

const PROMPT_VARS =
  "{store_name} {agent_name} {reason} {customer_name} {customer_phone} {recent_messages} {missing_fields} {language}";

const TTS_PROVIDERS = ["openai", "elevenlabs", "cartesia", "google"];
const LLM_PROVIDERS = ["openai", "anthropic"];
const INPUT = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm";

/** Which providers have API keys on the worker (self-reported at worker boot). */
interface ProviderAvailability {
  stt?: Record<string, boolean>;
  llm?: Record<string, boolean>;
  tts?: Record<string, boolean>;
}

export function VoiceConfigSection({ storeId }: { storeId: string }) {
  const [cfg, setCfg] = useState<VoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState("Guardado");
  const [applyToAll, setApplyToAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [avail, setAvail] = useState<ProviderAvailability | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [store, providers] = await Promise.all([
        api.get<{ voice_config: VoiceConfig }>(`/api/v1/stores/${storeId}`),
        api
          .get<{ reported: boolean; providers: ProviderAvailability | null }>(`/api/v1/voice-providers`)
          .catch(() => null),
      ]);
      setCfg(store.voice_config);
      setAvail(providers?.reported ? providers.providers : null);
    } catch {
      setError("No se pudo cargar la configuración de voz.");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  // No report yet (worker old/down) → don't gray anything out.
  const isAvailable = (group: "tts" | "llm", p: string): boolean =>
    !avail ? true : avail[group]?.[p] === true;

  useEffect(() => { load(); }, [load]);

  function set<K extends keyof VoiceConfig>(k: K, v: VoiceConfig[K]) {
    setSavedAt(null);
    setCfg((c) => (c ? { ...c, [k]: v } : c));
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<{ applied_to_all?: boolean; modified?: number }>(
        `/api/v1/stores/${storeId}/voice-config`,
        { ...cfg, applyToAll },
      );
      setSavedMsg(
        res.applied_to_all ? `Aplicado a ${res.modified ?? "todas las"} farmacias` : "Guardado",
      );
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="text-xs uppercase text-slate-500 mb-2 flex items-center gap-1.5">
        <Mic className="w-3.5 h-3.5" /> Configuración de voz
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      ) : !cfg ? (
        <div className="text-sm text-red-600">{error || "Sin configuración."}</div>
      ) : (
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            <span className="text-slate-700">Llamadas de voz habilitadas</span>
          </label>

          <Field label="Proveedor de voz (TTS)">
            <select value={cfg.tts_provider} onChange={(e) => set("tts_provider", e.target.value)} className={INPUT}>
              {TTS_PROVIDERS.map((p) => {
                const ok = isAvailable("tts", p);
                return (
                  <option key={p} value={p} disabled={!ok} className={ok ? "" : "text-slate-400"}>
                    {p}{ok ? "" : " (sin key)"}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Voz (id / nombre)">
            <input
              value={cfg.tts_voice}
              onChange={(e) => set("tts_voice", e.target.value)}
              className={INPUT}
              placeholder="ej: nova · voiceId de ElevenLabs · sonic"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estabilidad (0–1)">
              <input
                type="number" min={0} max={1} step={0.05}
                value={cfg.tts_stability ?? 0.5}
                onChange={(e) => set("tts_stability", Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
                className={INPUT}
              />
            </Field>
            <Field label="Estilo / energía (0–1)">
              <input
                type="number" min={0} max={1} step={0.05}
                value={cfg.tts_style ?? 0.2}
                onChange={(e) => set("tts_style", Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
                className={INPUT}
              />
            </Field>
          </div>
          <div className="text-[11px] text-slate-400">
            Solo ElevenLabs · Estabilidad: baja = expresiva pero variable, alta = plana y consistente · Estilo: energía/ánimo de la voz.
          </div>

          <Field label="Cerebro (LLM)">
            <select value={cfg.llm_provider} onChange={(e) => set("llm_provider", e.target.value)} className={INPUT}>
              {LLM_PROVIDERS.map((p) => {
                const ok = isAvailable("llm", p);
                return (
                  <option key={p} value={p} disabled={!ok} className={ok ? "" : "text-slate-400"}>
                    {p}{ok ? "" : " (sin key)"}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Modelo LLM">
            <input
              value={cfg.llm_model}
              onChange={(e) => set("llm_model", e.target.value)}
              className={INPUT}
              placeholder="gpt-4o-mini · claude-..."
            />
          </Field>

          <Field label="Idioma">
            <input value={cfg.language} onChange={(e) => set("language", e.target.value)} className={INPUT} />
          </Field>
          <Field label="Saludo — instrucción para la primera frase (opcional)">
            <textarea
              value={cfg.greeting}
              onChange={(e) => set("greeting", e.target.value)}
              maxLength={300}
              rows={2}
              className={INPUT}
              placeholder='ej: "Saluda diciendo: Hola, soy Sofía de Farmacia Geremy…" — vacío = el agente abre según el prompt'
            />
          </Field>

          <Field label="Prompt del agente (plantilla — control total)">
            <textarea
              value={cfg.prompt_template ?? ""}
              onChange={(e) => set("prompt_template", e.target.value)}
              maxLength={6000}
              rows={12}
              className={`${INPUT} font-mono text-xs`}
            />
          </Field>
          <div className="text-[11px] text-slate-400">
            Variables disponibles (se rellenan por llamada con datos reales): <span className="font-mono">{PROMPT_VARS}</span>
          </div>

          <div className="text-[11px] text-slate-400">
            STT: {cfg.stt_provider} {cfg.stt_model} · Las API keys viven en el servidor, no aquí.
          </div>

          {error && (
            <div className="text-red-600 text-xs flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          )}

          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => { setApplyToAll(e.target.checked); setSavedAt(null); }}
            />
            <span className="text-slate-700">
              Aplicar a <strong>todas</strong> las farmacias (default global)
            </span>
          </label>

          <button
            onClick={save}
            disabled={saving}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedAt ? <Check className="w-4 h-4" /> : null}
            {savedAt ? savedMsg : applyToAll ? "Aplicar a todas las farmacias" : "Guardar configuración de voz"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
