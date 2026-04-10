"use client";

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import {
  Search,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Printer,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Order {
  id: number;
  name: string;
  customer: string;
  customerId: number | null;
  date: string;
  total: number;
  status: string;
  odooState: string;
  lines?: { id: number; productId: number; name: string; qty: number; price: number; subtotal: number }[];
}

const statusConfig: Record<
  string,
  { label: string; badge: string; icon: React.ElementType }
> = {
  pending: { label: "Pendiente", badge: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  ready: { label: "Listo", badge: "bg-sky-50 text-sky-700 border-sky-200", icon: CheckCircle2 },
  dispatched: { label: "Despachado", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Truck },
  cancelled: { label: "Cancelado", badge: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
};

const tabs = [
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendientes" },
  { key: "ready", label: "Listos" },
  { key: "dispatched", label: "Despachados" },
  { key: "cancelled", label: "Cancelados" },
];

export default function OrdersPage() {
  const { currentStore } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const storeId = currentStore?.id || "store_leo";

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeTab !== "all") params.status = activeTab;
      const data = await api.get<Order[]>(`/api/v1/stores/${storeId}/orders`, params);
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, activeTab]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function loadOrderDetail(order: Order) {
    setDetailLoading(true);
    try {
      const detail = await api.get<Order>(`/api/v1/stores/${storeId}/orders/${order.id}`);
      setSelectedOrder(detail);
    } catch {
      setSelectedOrder(order);
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateStatus(orderId: number, status: string) {
    try {
      await api.patch(`/api/v1/stores/${storeId}/orders/${orderId}/status`, { status });
      await loadOrders();
      setSelectedOrder(null);
    } catch (err) {
      alert("Error actualizando estado");
    }
  }

  const filtered = orders.filter((o) => {
    if (search && !o.customer.toLowerCase().includes(search.toLowerCase()) && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pedidos</h1>
        <p className="text-sm text-slate-500 mt-1">Gestiona los pedidos de la farmacia</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedOrder(null); }}
            className={clsx(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente o # pedido..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
        />
      </div>

      <div className="flex gap-6">
        {/* Orders list */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No hay pedidos
                </div>
              ) : (
                filtered.map((order) => {
                  const config = statusConfig[order.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <div
                      key={order.id}
                      onClick={() => loadOrderDetail(order)}
                      className={clsx(
                        "flex items-center justify-between px-5 py-4 hover:bg-slate-50 cursor-pointer transition-colors",
                        selectedOrder?.id === order.id && "bg-primary-light"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Package className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{order.customer}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {order.name} · {new Date(order.date).toLocaleString("es-DO", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-700">
                          RD${order.total.toLocaleString()}
                        </span>
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1 ${config.badge}`}>
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Order detail panel */}
        {selectedOrder && (
          <div className="w-96 bg-white rounded-xl border border-slate-200 p-5 h-fit sticky top-20 hidden xl:block">
            {detailLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">{selectedOrder.name}</h3>
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${(statusConfig[selectedOrder.status] || statusConfig.pending).badge}`}>
                    {(statusConfig[selectedOrder.status] || statusConfig.pending).label}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-slate-500">Cliente</p>
                    <p className="font-medium text-slate-900">{selectedOrder.customer}</p>
                  </div>

                  {selectedOrder.lines && selectedOrder.lines.length > 0 && (
                    <div>
                      <p className="text-slate-500 mb-2">Productos</p>
                      <div className="space-y-2">
                        {selectedOrder.lines.map((line) => (
                          <div key={line.id} className="flex items-center justify-between">
                            <span className="text-slate-700">
                              {line.qty}x {line.name}
                            </span>
                            <span className="text-slate-500">RD${line.subtotal.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 font-semibold">
                        <span>Total</span>
                        <span>RD${selectedOrder.total.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {selectedOrder.status === "pending" && (
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => updateStatus(selectedOrder.id, "ready")}
                      className="flex-1 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Marcar listo
                    </button>
                    <button
                      onClick={() => updateStatus(selectedOrder.id, "cancelled")}
                      className="py-2 px-3 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {selectedOrder.status === "ready" && (
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => updateStatus(selectedOrder.id, "dispatched")}
                      className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Truck className="w-4 h-4" />
                      Despachar
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
