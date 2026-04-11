"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, Save, Loader2, Check, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface AgentConfig {
  agent_name: string;
  greeting_style: "formal" | "casual" | "amigable";
  signature: string;
  business_hours: string;
  delivery_info: string;
  custom_notes: string;
}

interface StoreInfo {
  store_id: string;
  name: string;
  agent_config: AgentConfig;
}

const GREETING_SAMPLES: Record<string, string> = {
  formal: "Buenos días, mi nombre es {agent_name} y soy su asistente. ¿En qué puedo ayudarle?",
  casual: "¡Hola! Soy {agent_name}, cuéntame qué necesitas.",
  amigable: "¡Hola! Soy {agent_name} 👋 ¿En qué te puedo ayudar hoy?",
};

export default function AgentPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id || "store_leo";

  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [storeName, setStoreName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<StoreInfo>(`/api/v1/stores/${storeId}`);
      setConfig(data.agent_config);
      setStoreName(data.name);
    } catch {
      setError("No se pudo cargar la configuración del agente");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/v1/stores/${storeId}/agent-config`, config);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof AgentConfig>(field: K, value: AgentConfig[K]) {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Cargando…
      </div>
    );
  }
  if (!config) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || "Configuración no disponible"}
        </div>
      </div>
    );
  }

  const previewGreeting = (GREETING_SAMPLES[config.greeting_style] || GREETING_SAMPLES.amigable)
    .replace("{agent_name}", config.agent_name || "Sofía");

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Mi Agente</h1>
            <p className="text-sm text-slate-500">
              Personaliza cómo el agente de WhatsApp habla con tus clientes en{" "}
              <strong>{storeName}</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nombre del agente
              </label>
              <input
                value={config.agent_name}
                onChange={(e) => update("agent_name", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="Sofía"
                maxLength={200}
              />
              <p className="text-xs text-slate-500 mt-1">
                Cómo se presenta el agente al saludar. Ej: <em>Sofía</em>, <em>Carlos</em>,
                <em> Luisa</em>.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Estilo de saludo
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["formal", "casual", "amigable"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => update("greeting_style", style)}
                    className={
                      "px-3 py-2 rounded-lg text-sm border transition-colors " +
                      (config.greeting_style === style
                        ? "border-2 border-primary bg-primary-alpha15 font-medium"
                        : "border-slate-200 hover:border-slate-300")
                    }
                    style={
                      config.greeting_style === style
                        ? { color: "var(--primary)", borderColor: "var(--primary)" }
                        : undefined
                    }
                  >
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Firma / despedida
              </label>
              <input
                value={config.signature}
                onChange={(e) => update("signature", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder={`— ${storeName}`}
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Horario de atención
              </label>
              <input
                value={config.business_hours}
                onChange={(e) => update("business_hours", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="Lun-Sáb 8:00-22:00, Dom 9:00-20:00"
                maxLength={200}
              />
              <p className="text-xs text-slate-500 mt-1">
                El agente menciona este horario cuando un cliente pregunta.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Información de delivery
              </label>
              <input
                value={config.delivery_info}
                onChange={(e) => update("delivery_info", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                placeholder="Delivery gratis sobre RD$500 en toda la zona"
                maxLength={200}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Notas adicionales
              </label>
              <textarea
                value={config.custom_notes}
                onChange={(e) => update("custom_notes", e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[100px]"
                placeholder="Ej: Promoción de vitaminas los viernes. Aceptamos seguros ARS humano..."
                maxLength={500}
              />
              <p className="text-xs text-slate-500 mt-1">
                Hasta 500 caracteres. El agente puede usar esta información cuando sea relevante.
                ({config.custom_notes.length}/500)
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            {savedAt && !error && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <Check className="w-4 h-4" />
                Guardado
              </div>
            )}
            <div className="flex-1" />
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar cambios
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit sticky top-4">
          <div className="text-xs uppercase text-slate-500 mb-3">Vista previa</div>
          <div className="space-y-3">
            <div className="text-xs text-slate-500">Primer mensaje al cliente:</div>
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-800 italic">
              {previewGreeting}
            </div>
            {config.signature && (
              <>
                <div className="text-xs text-slate-500">Firma al final de un mensaje:</div>
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-800 italic">
                  {config.signature}
                </div>
              </>
            )}
            {config.business_hours && (
              <>
                <div className="text-xs text-slate-500">Horario:</div>
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-700">
                  {config.business_hours}
                </div>
              </>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
            Los cambios aplican en máximo 1 minuto para los próximos mensajes entrantes.
          </div>
        </div>
      </div>
    </div>
  );
}
