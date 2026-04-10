"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  Search,
  Filter,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Eye,
  Printer,
} from "lucide-react";

interface Order {
  id: string;
  customer: string;
  phone: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  status: "pending" | "ready" | "dispatched" | "cancelled";
  source: "bot" | "manual";
  createdAt: string;
}

// Mock data
const mockOrders: Order[] = [
  {
    id: "ORD-001",
    customer: "María López",
    phone: "+1809-555-0101",
    items: [
      { name: "Acetaminofén 500mg", qty: 2, price: 150 },
      { name: "Ibuprofeno 400mg", qty: 1, price: 200 },
      { name: "Vitamina C 1000mg", qty: 1, price: 350 },
    ],
    total: 850,
    status: "pending",
    source: "bot",
    createdAt: "2026-04-10T10:30:00",
  },
  {
    id: "ORD-002",
    customer: "José García",
    phone: "+1809-555-0102",
    items: [{ name: "Amoxicilina 500mg", qty: 1, price: 450 }],
    total: 450,
    status: "ready",
    source: "bot",
    createdAt: "2026-04-10T10:15:00",
  },
  {
    id: "ORD-003",
    customer: "Ana Reyes",
    phone: "+1809-555-0103",
    items: [
      { name: "Omeprazol 20mg", qty: 3, price: 180 },
      { name: "Loratadina 10mg", qty: 2, price: 120 },
      { name: "Ranitidina 150mg", qty: 1, price: 95 },
      { name: "Metformina 850mg", qty: 2, price: 200 },
      { name: "Enalapril 10mg", qty: 1, price: 175 },
    ],
    total: 1310,
    status: "dispatched",
    source: "bot",
    createdAt: "2026-04-10T09:45:00",
  },
  {
    id: "ORD-004",
    customer: "Carlos Marte",
    phone: "+1809-555-0104",
    items: [
      { name: "Diclofenac 50mg", qty: 1, price: 130 },
      { name: "Complejo B", qty: 1, price: 250 },
    ],
    total: 380,
    status: "pending",
    source: "manual",
    createdAt: "2026-04-10T09:30:00",
  },
  {
    id: "ORD-005",
    customer: "Laura Sánchez",
    phone: "+1809-555-0105",
    items: [{ name: "Cetirizina 10mg", qty: 1, price: 175 }],
    total: 175,
    status: "cancelled",
    source: "bot",
    createdAt: "2026-04-10T09:00:00",
  },
];

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
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const filtered = mockOrders.filter((o) => {
    if (activeTab !== "all" && o.status !== activeTab) return false;
    if (search && !o.customer.toLowerCase().includes(search.toLowerCase()) && !o.id.toLowerCase().includes(search.toLowerCase())) return false;
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
            onClick={() => setActiveTab(tab.key)}
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
          <div className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No hay pedidos
              </div>
            ) : (
              filtered.map((order) => {
                const config = statusConfig[order.status];
                const StatusIcon = config.icon;
                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
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
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{order.customer}</p>
                          {order.source === "bot" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">BOT</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {order.id} · {order.items.length} items · {new Date(order.createdAt).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
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
        </div>

        {/* Order detail panel */}
        {selectedOrder && (
          <div className="w-96 bg-white rounded-xl border border-slate-200 p-5 h-fit sticky top-20 hidden xl:block">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">{selectedOrder.id}</h3>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusConfig[selectedOrder.status].badge}`}>
                {statusConfig[selectedOrder.status].label}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-slate-500">Cliente</p>
                <p className="font-medium text-slate-900">{selectedOrder.customer}</p>
                <p className="text-xs text-slate-400">{selectedOrder.phone}</p>
              </div>

              <div>
                <p className="text-slate-500 mb-2">Productos</p>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-slate-700">
                        {item.qty}x {item.name}
                      </span>
                      <span className="text-slate-500">RD${item.price * item.qty}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 font-semibold">
                  <span>Total</span>
                  <span>RD${selectedOrder.total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            {selectedOrder.status === "pending" && (
              <div className="mt-5 flex gap-2">
                <button className="flex-1 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition-colors">
                  Marcar listo
                </button>
                <button className="py-2 px-3 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors">
                  Cancelar
                </button>
              </div>
            )}
            {selectedOrder.status === "ready" && (
              <div className="mt-5 flex gap-2">
                <button className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Truck className="w-4 h-4" />
                  Despachar
                </button>
                <button className="py-2 px-3 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors">
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
