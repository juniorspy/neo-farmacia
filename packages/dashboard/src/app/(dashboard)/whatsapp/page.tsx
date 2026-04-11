"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Smartphone,
  Wifi,
  WifiOff,
  QrCode,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  X,
  Power,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Connection {
  id: string;
  label: string;
  instance_name: string;
  number: string | null;
  state: "qr" | "connecting" | "open" | "close" | "unknown";
  created_at?: string;
  connected_at?: string | null;
  disconnected_at?: string | null;
  qr_base64?: string | null;
}

function stateStyle(state: string) {
  switch (state) {
    case "open":
      return { label: "Conectado", color: "text-emerald-600", bg: "bg-emerald-50", icon: Wifi };
    case "qr":
    case "connecting":
      return { label: "Esperando escaneo", color: "text-amber-600", bg: "bg-amber-50", icon: QrCode };
    case "close":
      return { label: "Desconectado", color: "text-slate-500", bg: "bg-slate-100", icon: Power };
    default:
      return { label: "Desconocido", color: "text-slate-400", bg: "bg-slate-100", icon: WifiOff };
  }
}

export default function WhatsAppPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id || "store_leo";

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  const [showLabelModal, setShowLabelModal] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const [qrModal, setQrModal] = useState<{
    connectionId: string;
    qr: string | null;
    label: string;
  } | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const qrRefreshRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Connection[]>(
        `/api/v1/stores/${storeId}/whatsapp/connections`,
      );
      setConnections(data);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (qrRefreshRef.current) clearInterval(qrRefreshRef.current);
    };
  }, [load]);

  function openQr(connectionId: string, qr: string | null, label: string) {
    setQrModal({ connectionId, qr, label });

    // Poll connection state every 3s, auto-close on 'open'
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await api.get<Connection>(
          `/api/v1/stores/${storeId}/whatsapp/connections/${connectionId}`,
        );
        setConnections((prev) =>
          prev.map((c) => (c.id === connectionId ? { ...c, ...fresh } : c)),
        );
        if (fresh.state === "open") closeQr();
      } catch { /* ignore */ }
    }, 3000);

    // Refresh QR every 30s (they expire around 60s)
    if (qrRefreshRef.current) clearInterval(qrRefreshRef.current);
    qrRefreshRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ qr_base64: string | null }>(
          `/api/v1/stores/${storeId}/whatsapp/connections/${connectionId}/qr`,
        );
        if (res.qr_base64) {
          setQrModal((prev) => (prev ? { ...prev, qr: res.qr_base64 } : null));
        }
      } catch { /* ignore */ }
    }, 30000);
  }

  function closeQr() {
    setQrModal(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (qrRefreshRef.current) { clearInterval(qrRefreshRef.current); qrRefreshRef.current = null; }
    load();
  }

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<Connection>(
        `/api/v1/stores/${storeId}/whatsapp/connections`,
        { label: newLabel.trim() },
      );
      setShowLabelModal(false);
      setNewLabel("");
      await load();
      openQr(res.id, res.qr_base64 || null, res.label);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creando conexión");
    } finally {
      setCreating(false);
    }
  }

  async function handleDisconnect(conn: Connection) {
    if (!confirm(`¿Desconectar "${conn.label}"? La sesión terminará pero podrás reconectarla después.`)) return;
    try {
      await api.post(
        `/api/v1/stores/${storeId}/whatsapp/connections/${conn.id}/disconnect`,
      );
      await load();
    } catch {
      alert("Error al desconectar");
    }
  }

  async function handleReconnect(conn: Connection) {
    try {
      const res = await api.post<{ qr_base64: string | null }>(
        `/api/v1/stores/${storeId}/whatsapp/connections/${conn.id}/reconnect`,
      );
      openQr(conn.id, res.qr_base64, conn.label);
    } catch {
      alert("Error al reconectar");
    }
  }

  async function handleDelete(conn: Connection) {
    if (!confirm(`¿Eliminar "${conn.label}" permanentemente? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/v1/stores/${storeId}/whatsapp/connections/${conn.id}`);
      await load();
    } catch {
      alert("Error al eliminar");
    }
  }

  async function handleShowQr(conn: Connection) {
    try {
      const res = await api.get<{ qr_base64: string | null }>(
        `/api/v1/stores/${storeId}/whatsapp/connections/${conn.id}/qr`,
      );
      openQr(conn.id, res.qr_base64, conn.label);
    } catch {
      alert("No se pudo obtener el código QR");
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Cargando…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Conexiones de WhatsApp</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cada conexión es un número de WhatsApp independiente vinculado a{" "}
            <strong>{currentStore?.name || "la farmacia"}</strong>.
            Puedes tener varias (caja principal, delivery, farmacéutico de guardia, etc.).
          </p>
        </div>
        <button
          onClick={() => { setNewLabel(""); setShowLabelModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium shrink-0"
          style={{ backgroundColor: "var(--primary)" }}
        >
          <Plus className="w-4 h-4" />
          Agregar conexión
        </button>
      </div>

      {connections.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            Aún no hay conexiones
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Agrega tu primera conexión de WhatsApp para que el agente empiece a
            recibir mensajes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((conn) => {
            const info = stateStyle(conn.state);
            const StateIcon = info.icon;
            const isConnected = conn.state === "open";
            const needsScan = conn.state === "qr" || conn.state === "connecting";
            const isDisconnected = conn.state === "close";

            return (
              <div
                key={conn.id}
                className="bg-white rounded-xl border border-slate-200 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${info.bg} shrink-0`}>
                      <StateIcon className={`w-5 h-5 ${info.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 truncate">
                          {conn.label}
                        </p>
                        {isConnected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      </div>
                      <p className="text-sm text-slate-500 truncate">
                        {conn.number || "Sin número aún"}
                      </p>
                      <p className={`text-xs ${info.color} mt-0.5 font-medium`}>
                        {info.label}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                  {needsScan && (
                    <button
                      onClick={() => handleShowQr(conn)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Mostrar QR
                    </button>
                  )}
                  {isDisconnected && (
                    <button
                      onClick={() => handleReconnect(conn)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-medium hover:bg-sky-100"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reconectar
                    </button>
                  )}
                  {isConnected && (
                    <button
                      onClick={() => handleDisconnect(conn)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Desconectar
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => handleDelete(conn)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Label modal */}
      {showLabelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">Nueva conexión</h2>
              <button
                onClick={() => setShowLabelModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Título de la conexión</span>
                <input
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  maxLength={60}
                  placeholder="ej: Caja principal, Delivery, Farmacéutico de guardia"
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Un nombre corto para identificar esta línea de WhatsApp.
                </p>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLabelModal(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newLabel.trim()}
                  className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50 flex items-center gap-2"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Crear y escanear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-900">Escanear código QR</h3>
                <p className="text-xs text-slate-500">{qrModal.label}</p>
              </div>
              <button onClick={closeQr} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {qrModal.qr ? (
              <div className="flex justify-center p-4 bg-slate-50 rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrModal.qr.startsWith("data:") ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`}
                  alt="WhatsApp QR"
                  className="w-64 h-64"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 bg-slate-50 rounded-lg">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            )}

            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Cómo escanear:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Abre WhatsApp en tu teléfono</li>
                <li>Toca Menú (⋮) → Dispositivos vinculados</li>
                <li>Toca &ldquo;Vincular un dispositivo&rdquo;</li>
                <li>Apunta tu teléfono a este código</li>
              </ol>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Esperando que escanees el código…
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
