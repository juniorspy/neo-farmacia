"use client";

import { useState, useEffect, useCallback } from "react";
import { Smartphone, Wifi, WifiOff, QrCode, Plus, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Instance {
  id: string;
  name: string;
  status: string;
  number: string | null;
}

export default function WhatsAppPage() {
  const { currentStore } = useStore();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const storeId = currentStore?.id || "store_leo";

  const loadInstances = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Instance[]>(`/api/v1/stores/${storeId}/whatsapp/instances`);
      setInstances(data);
    } catch {
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { loadInstances(); }, [loadInstances]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post(`/api/v1/stores/${storeId}/whatsapp/instances`, { name: newName.trim() });
      setNewName("");
      setShowCreate(false);
      await loadInstances();
    } catch {
      alert("Error creando instancia");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`¿Eliminar instancia "${name}"?`)) return;
    try {
      await api.delete(`/api/v1/stores/${storeId}/whatsapp/instances/${name}`);
      await loadInstances();
    } catch {
      alert("Error eliminando instancia");
    }
  }

  function getStatusInfo(status: string) {
    if (status === "open" || status === "connected") {
      return { icon: Wifi, label: "Conectado", color: "text-emerald-500", bg: "bg-emerald-50" };
    }
    if (status === "connecting" || status === "qr") {
      return { icon: QrCode, label: "Escanear QR", color: "text-amber-500", bg: "bg-amber-50" };
    }
    return { icon: WifiOff, label: "Desconectado", color: "text-red-400", bg: "bg-slate-100" };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">WhatsApp</h1>
          <p className="text-sm text-slate-500 mt-1">Instancias conectadas via Evolution API</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva instancia
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre de la instancia</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="farmacia-leo-principal"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear"}
          </button>
        </div>
      )}

      {/* Instances */}
      {loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : instances.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Smartphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No hay instancias de WhatsApp</p>
          <p className="text-slate-300 text-xs mt-1">Crea una instancia para conectar un número</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {instances.map((inst) => {
            const statusInfo = getStatusInfo(inst.status);
            const StatusIcon = statusInfo.icon;
            return (
              <div key={inst.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${statusInfo.bg}`}>
                      <Smartphone className={`w-5 h-5 ${statusInfo.color}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{inst.name}</p>
                      <p className="text-sm text-slate-500">{inst.number || "Sin número"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(inst.name)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`w-4 h-4 ${statusInfo.color}`} />
                    <span className={`text-sm font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                  </div>
                  <span className="text-xs text-slate-400">{inst.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
