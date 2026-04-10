"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, ShoppingCart, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Customer {
  id: string;
  name: string;
  phone: string;
  chatId: string;
  registered: boolean;
  createdAt: string;
}

export default function CustomersPage() {
  const { currentStore } = useStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const storeId = currentStore?.id || "store_leo";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      const data = await api.get<Customer[]>(`/api/v1/stores/${storeId}/customers`, params);
      setCustomers(data);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, debouncedSearch]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
        <p className="text-sm text-slate-500 mt-1">Clientes que han interactuado por WhatsApp</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
        />
      </div>

      {loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-400 text-sm">No hay clientes registrados aún</p>
          <p className="text-slate-300 text-xs mt-1">Los clientes aparecerán cuando interactúen por WhatsApp</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {customers.map((customer) => (
            <div key={customer.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary-light text-primary flex items-center justify-center text-sm font-bold">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{customer.name}</p>
                    <p className="text-xs text-slate-400">{customer.phone}</p>
                  </div>
                </div>
                {customer.registered && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium">
                    Registrado
                  </span>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
                Desde {new Date(customer.createdAt).toLocaleDateString("es-DO")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
