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
} from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Connection {
  bound: boolean;
  instance_name?: string;
  number?: string | null;
  state?: string;
  qr_base64?: string | null;
}

function stateLabel(state: string | undefined) {
  switch (state) {
    case "open":
    case "connected":
      return { label: "Conectado", color: "text-emerald-600", bg: "bg-emerald-50", icon: Wifi };
    case "connecting":
    case "qr":
    case "qrReadSuccess":
      return { label: "Esperando escaneo", color: "text-amber-600", bg: "bg-amber-50", icon: QrCode };
    case "close":
    case "disconnected":
    case "logout":
      return { label: "Desconectado", color: "text-red-500", bg: "bg-red-50", icon: WifiOff };
    default:
      return { label: state || "Desconocido", color: "text-slate-500", bg: "bg-slate-100", icon: WifiOff };
  }
}

export default function WhatsAppPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id || "store_leo";

  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [qrModal, setQrModal] = useState<{ qr: string | null; polling: boolean } | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadConnection = useCallback(async () => {
    try {
      const data = await api.get<Connection>(`/api/v1/stores/${storeId}/whatsapp/connection`);
      setConnection(data);
      return data;
    } catch {
      setConnection({ bound: false });
      return { bound: false } as Connection;
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadConnection();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    };
  }, [loadConnection]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await api.post<Connection>(
        `/api/v1/stores/${storeId}/whatsapp/connection`,
      );
      await loadConnection();
      if (res.qr_base64) {
        openQrModal(res.qr_base64);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creando conexión");
    } finally {
      setCreating(false);
    }
  }

  function openQrModal(qr: string | null) {
    setQrModal({ qr, polling: true });

    // Poll connection state every 3s — close modal when connected
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      const fresh = await loadConnection();
      const state = fresh?.state;
      if (state === "open" || state === "connected") {
        closeQrModal();
      }
    }, 3000);

    // Refresh QR every 30s (Evolution QRs expire ~every 60s)
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    qrIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ qr_base64: string | null }>(
          `/api/v1/stores/${storeId}/whatsapp/connection/qr`,
        );
        if (res.qr_base64) setQrModal((prev) => (prev ? { ...prev, qr: res.qr_base64 } : null));
      } catch { /* ignore */ }
    }, 30000);
  }

  function closeQrModal() {
    setQrModal(null);
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (qrIntervalRef.current) { clearInterval(qrIntervalRef.current); qrIntervalRef.current = null; }
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar esta conexión de WhatsApp? Tendrás que volver a escanear el QR para reconectar.")) return;
    try {
      await api.delete(`/api/v1/stores/${storeId}/whatsapp/connection`);
      await loadConnection();
    } catch {
      alert("Error eliminando conexión");
    }
  }

  async function handleShowQr() {
    // Already bound but not yet scanned — open the modal and fetch a fresh QR
    try {
      const res = await api.get<{ qr_base64: string | null }>(
        `/api/v1/stores/${storeId}/whatsapp/connection/qr`,
      );
      openQrModal(res.qr_base64);
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

  const state = connection?.state || "";
  const info = stateLabel(state);
  const StateIcon = info.icon;
  const isConnected = state === "open" || state === "connected";
  const needsScan = connection?.bound && !isConnected;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Conexión de WhatsApp</h1>
        <p className="text-sm text-slate-500 mt-1">
          Conecta el número de WhatsApp de <strong>{currentStore?.name || "la farmacia"}</strong> para
          que el agente reciba y responda mensajes automáticamente.
        </p>
      </div>

      {/* Not bound yet — show "Conectar" CTA */}
      {!connection?.bound && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <Smartphone className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Aún no hay un WhatsApp conectado
          </h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Al conectar, se generará un código QR que podrás escanear desde la app de WhatsApp en tu teléfono.
            Una vez conectado, todos los mensajes entrantes pasarán por el agente automático.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Conectar WhatsApp
          </button>
        </div>
      )}

      {/* Bound — show status card */}
      {connection?.bound && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${info.bg} shrink-0`}>
                <StateIcon className={`w-6 h-6 ${info.color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900 truncate">
                    {connection.number || "Sin número vinculado"}
                  </p>
                  {isConnected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <p className={`text-sm ${info.color} font-medium`}>{info.label}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  Instancia: <span className="font-mono">{connection.instance_name}</span>
                </p>
              </div>
            </div>
            <button
              onClick={handleDelete}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
              title="Eliminar conexión"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          {needsScan && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Esta conexión aún no ha sido escaneada.
                </p>
                <button
                  onClick={handleShowQr}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-sm text-slate-700"
                >
                  <QrCode className="w-4 h-4" />
                  Mostrar código QR
                </button>
              </div>
            </div>
          )}

          <button
            onClick={loadConnection}
            className="mt-4 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Actualizar estado
          </button>
        </div>
      )}

      {/* QR modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Escanear código QR</h3>
              <button
                onClick={closeQrModal}
                className="text-slate-400 hover:text-slate-600"
              >
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
