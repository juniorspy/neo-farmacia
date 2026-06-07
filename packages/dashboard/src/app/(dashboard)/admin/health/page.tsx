"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  PhoneMissed,
  Smartphone,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface ConnHealth {
  id: string;
  label: string;
  number: string | null;
  state: "qr" | "connecting" | "open" | "close" | "unknown";
}

interface StoreHealth {
  store_id: string;
  name: string;
  status: string;
  whatsapp: ConnHealth[];
  catalog: {
    documents: number | null;
    indexing: boolean | null;
    last_synced_at: string | null;
    last_error: string | null;
  };
  last_message: {
    timestamp: string;
    direction: "inbound" | "outbound";
    sender: string;
  } | null;
  voice_today: { total: number; missed: number };
  provisioning_error: string | null;
}

interface FleetHealth {
  generated_at: string;
  fleet: StoreHealth[];
}

const CONN_STATE_STYLES: Record<ConnHealth["state"], { dot: string; label: string }> = {
  open: { dot: "bg-emerald-500", label: "conectado" },
  connecting: { dot: "bg-amber-500", label: "conectando" },
  qr: { dot: "bg-amber-500", label: "esperando QR" },
  close: { dot: "bg-red-500", label: "desconectado" },
  unknown: { dot: "bg-slate-400", label: "desconocido" },
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export default function AdminFleetHealthPage() {
  const { user } = useAuth();
  const [data, setData] = useState<FleetHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.get<FleetHealth>("/api/v1/admin/fleet-health");
      setData(res);
    } catch {
      /* keep last snapshot on error */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (user?.role !== "admin") {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Acceso denegado. Solo super-administradores.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Salud de flota</h1>
          <p className="text-sm text-slate-500 mt-1">
            Estado operativo de cada farmacia: WhatsApp, catálogo, actividad y errores.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-slate-500">
              Actualizado {timeAgo(data.generated_at)}
            </span>
          )}
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={clsx("w-4 h-4", refreshing && "animate-spin")} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Consultando flota…
          </div>
        ) : !data || data.fleet.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Activity className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            No hay farmacias.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Farmacia</th>
                <th className="text-left px-4 py-3 font-medium">WhatsApp</th>
                <th className="text-left px-4 py-3 font-medium">Catálogo</th>
                <th className="text-left px-4 py-3 font-medium">Último mensaje</th>
                <th className="text-left px-4 py-3 font-medium">Voz hoy</th>
                <th className="text-left px-4 py-3 font-medium">Errores</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.fleet.map((s) => (
                <FleetRow key={s.store_id} store={s} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FleetRow({ store }: { store: StoreHealth }) {
  const errors = [
    store.provisioning_error && { label: "Provisioning", detail: store.provisioning_error },
    store.catalog.last_error && { label: "Sync catálogo", detail: store.catalog.last_error },
  ].filter(Boolean) as Array<{ label: string; detail: string }>;

  return (
    <tr className="hover:bg-slate-50 align-top">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{store.name}</div>
        <div className="text-xs text-slate-500 font-mono">{store.store_id}</div>
        {store.status !== "active" && (
          <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
            {store.status}
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        {store.whatsapp.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Smartphone className="w-3.5 h-3.5" />
            Sin conexiones
          </span>
        ) : (
          <div className="space-y-1">
            {store.whatsapp.map((c) => {
              const style = CONN_STATE_STYLES[c.state] || CONN_STATE_STYLES.unknown;
              return (
                <div key={c.id} className="flex items-center gap-2 text-sm" title={style.label}>
                  <span className={clsx("w-2 h-2 rounded-full shrink-0", style.dot)} />
                  <span className="text-slate-700">{c.label}</span>
                  {c.number && <span className="text-xs text-slate-400">{c.number}</span>}
                </div>
              );
            })}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="text-sm text-slate-900">
          {store.catalog.documents === null ? (
            <span className="text-red-600 text-xs">índice inaccesible</span>
          ) : (
            <>
              {store.catalog.documents.toLocaleString("es-DO")}{" "}
              <span className="text-xs text-slate-500">productos</span>
              {store.catalog.indexing && (
                <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-sky-500" />
              )}
            </>
          )}
        </div>
        <div className="text-xs text-slate-500">
          sync {timeAgo(store.catalog.last_synced_at)}
        </div>
      </td>

      <td className="px-4 py-3">
        {store.last_message ? (
          <div className="flex items-center gap-1.5 text-sm text-slate-700">
            {store.last_message.direction === "inbound" ? (
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <ArrowUpRight className="w-3.5 h-3.5 text-sky-600" />
            )}
            {timeAgo(store.last_message.timestamp)}
            <span className="text-xs text-slate-400">({store.last_message.sender})</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">sin actividad</span>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Phone className="w-3.5 h-3.5 text-slate-400" />
          {store.voice_today.total}
          {store.voice_today.missed > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-700 border border-red-200">
              <PhoneMissed className="w-3 h-3" />
              {store.voice_today.missed}
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        {errors.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
            OK
          </span>
        ) : (
          <div className="space-y-1">
            {errors.map((e) => (
              <div
                key={e.label}
                className="flex items-start gap-1 text-xs text-red-700"
                title={e.detail}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium">{e.label}:</span>{" "}
                  <span className="line-clamp-2 break-all">{e.detail}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
