"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import {
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Building2,
  X,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Step {
  name: string;
  status: "pending" | "running" | "done" | "failed";
  started_at?: string;
  finished_at?: string;
  error?: string | null;
}

interface Job {
  status: "pending" | "running" | "completed" | "failed";
  current_step_index: number;
  steps: Step[];
  last_error: string | null;
}

interface Pharmacy {
  store_id: string;
  name: string;
  owner_name: string;
  owner_email: string;
  status: "pending" | "provisioning" | "active" | "failed" | "suspended";
  odoo_db: string;
  created_at: string;
  job: Job | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  provisioning: "bg-sky-50 text-sky-700 border-sky-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  suspended: "bg-slate-100 text-slate-600 border-slate-200",
};

const STEP_LABELS: Record<string, string> = {
  mongo_store: "Registrar tienda",
  odoo_db_create: "Crear base de datos Odoo",
  odoo_seed_admin: "Configurar administrador",
  meilisearch_index: "Crear índice de búsqueda",
  agent_config: "Configurar agente IA",
  email_credentials: "Enviar credenciales",
};

export default function AdminPharmaciesPage() {
  const { user } = useAuth();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Pharmacy | null>(null);

  const loadPharmacies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Pharmacy[]>("/api/v1/admin/pharmacies");
      setPharmacies(data);
    } catch {
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPharmacies();
  }, [loadPharmacies]);

  // Auto-refresh every 3s while any pharmacy is provisioning
  useEffect(() => {
    const hasActive = pharmacies.some(
      (p) => p.status === "provisioning" || p.status === "pending",
    );
    if (!hasActive) return;
    const interval = setInterval(loadPharmacies, 3000);
    return () => clearInterval(interval);
  }, [pharmacies, loadPharmacies]);

  async function handleRetry(storeId: string) {
    await api.post(`/api/v1/admin/pharmacies/${storeId}/retry`);
    loadPharmacies();
  }

  async function handleDelete(storeId: string) {
    if (!confirm(`¿Eliminar farmacia ${storeId}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/v1/admin/pharmacies/${storeId}`, { confirm: "yes" });
      if (selected?.store_id === storeId) setSelected(null);
      loadPharmacies();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  }

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
          <h1 className="text-2xl font-semibold text-slate-900">Farmacias</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestión multi-tenant. Aprovisiona nuevas farmacias y supervisa el estado de cada una.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90"
          style={{ backgroundColor: "var(--primary)" }}
        >
          <Plus className="w-4 h-4" />
          Nueva farmacia
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Cargando…
          </div>
        ) : pharmacies.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            No hay farmacias. Crea la primera.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">Propietario</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Odoo DB</th>
                <th className="text-left px-4 py-3 font-medium">Creada</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pharmacies.map((p) => (
                <tr
                  key={p.store_id}
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelected(p)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.store_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-700">{p.owner_name}</div>
                    <div className="text-xs text-slate-500">{p.owner_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1 px-2 py-1 rounded text-xs border",
                        STATUS_STYLES[p.status] || "bg-slate-100 text-slate-600",
                      )}
                    >
                      {p.status === "active" && <CheckCircle2 className="w-3 h-3" />}
                      {p.status === "provisioning" && <Loader2 className="w-3 h-3 animate-spin" />}
                      {p.status === "pending" && <Clock className="w-3 h-3" />}
                      {p.status === "failed" && <AlertCircle className="w-3 h-3" />}
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.odoo_db}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(p.created_at).toLocaleString("es-DO")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === "failed" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(p.store_id);
                        }}
                        title="Reintentar"
                        className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    {p.store_id !== "store_leo" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.store_id);
                        }}
                        title="Eliminar"
                        className="p-1.5 rounded hover:bg-red-100 text-red-600 ml-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreatePharmacyModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadPharmacies();
          }}
        />
      )}

      {selected && (
        <PharmacyDetailsDrawer pharmacy={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function CreatePharmacyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/admin/pharmacies", {
        name: name.trim(),
        owner_name: ownerName.trim(),
        owner_email: ownerEmail.trim(),
        owner_phone: ownerPhone.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Nueva farmacia</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Nombre de la farmacia *</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="Farmacia Carol"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Propietario *</span>
            <input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="María Pérez"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Email del propietario *</span>
            <input
              required
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="maria@farmaciacarol.com"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Teléfono (opcional)</span>
            <input
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="+1 809 555 1234"
            />
          </label>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
          <div className="pt-2 text-xs text-slate-500">
            El aprovisionamiento toma ~30 segundos. Se creará una nueva base Odoo aislada y
            se enviarán las credenciales al propietario por email (stub por ahora).
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50 flex items-center gap-2"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear farmacia
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PharmacyDetailsDrawer({
  pharmacy,
  onClose,
}: {
  pharmacy: Pharmacy;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-slate-900">{pharmacy.name}</h2>
            <div className="text-xs text-slate-500 font-mono">{pharmacy.store_id}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs uppercase text-slate-500 mb-2">Información</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Propietario</dt>
              <dd className="text-slate-900">{pharmacy.owner_name}</dd>
              <dt className="text-slate-500">Email</dt>
              <dd className="text-slate-900 truncate">{pharmacy.owner_email}</dd>
              <dt className="text-slate-500">Estado</dt>
              <dd className="text-slate-900">{pharmacy.status}</dd>
              <dt className="text-slate-500">Odoo DB</dt>
              <dd className="text-slate-900 font-mono text-xs">{pharmacy.odoo_db}</dd>
              <dt className="text-slate-500">Creada</dt>
              <dd className="text-slate-900 text-xs">
                {new Date(pharmacy.created_at).toLocaleString("es-DO")}
              </dd>
            </dl>
          </div>

          {pharmacy.job && (
            <div>
              <div className="text-xs uppercase text-slate-500 mb-2">
                Aprovisionamiento — {pharmacy.job.status}
              </div>
              <ol className="space-y-2">
                {pharmacy.job.steps.map((step, i) => {
                  const isCurrent = i === pharmacy.job!.current_step_index;
                  return (
                    <li
                      key={step.name}
                      className={clsx(
                        "flex items-start gap-3 p-3 rounded-lg border text-sm",
                        step.status === "done" && "bg-emerald-50 border-emerald-200",
                        step.status === "running" && "bg-sky-50 border-sky-200",
                        step.status === "failed" && "bg-red-50 border-red-200",
                        step.status === "pending" && "bg-slate-50 border-slate-200",
                      )}
                    >
                      <div className="pt-0.5">
                        {step.status === "done" && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        )}
                        {step.status === "running" && (
                          <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />
                        )}
                        {step.status === "failed" && (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                        {step.status === "pending" && (
                          <Clock className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">
                          {STEP_LABELS[step.name] || step.name}
                          {isCurrent && pharmacy.job!.status === "failed" && " — falló"}
                        </div>
                        {step.error && (
                          <div className="text-xs text-red-600 mt-1 font-mono">{step.error}</div>
                        )}
                        {step.started_at && step.finished_at && (
                          <div className="text-xs text-slate-500 mt-1">
                            {(
                              (new Date(step.finished_at).getTime() -
                                new Date(step.started_at).getTime()) /
                              1000
                            ).toFixed(1)}
                            s
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {pharmacy.job.last_error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <div className="font-medium mb-1">Último error</div>
                  <div className="font-mono">{pharmacy.job.last_error}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
