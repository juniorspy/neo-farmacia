"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  ShoppingCart,
  DollarSign,
  Clock,
  MessageSquare,
  TrendingUp,
  Package,
  Users,
  Bot,
  User,
  CheckCircle2,
  XCircle,
  Truck,
  Printer as PrinterIcon,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";

// ── Mock data ──

const stats = {
  totalSales: 87200,
  totalOrders: 142,
  completedOrders: 118,
  avgPerOrder: 614,
  uniqueCustomers: 67,
  pendingOrders: 8,
  activeChats: 12,
  botHandled: 78,
};

const recentOrders = [
  { id: "ORD-001", customer: "María López", items: 3, total: 1250, status: "pending", time: "Hace 5 min" },
  { id: "ORD-002", customer: "José García", items: 1, total: 450, status: "ready", time: "Hace 12 min" },
  { id: "ORD-003", customer: "Ana Reyes", items: 5, total: 3200, status: "dispatched", time: "Hace 28 min" },
  { id: "ORD-004", customer: "Carlos Marte", items: 2, total: 890, status: "pending", time: "Hace 35 min" },
  { id: "ORD-005", customer: "Laura Sánchez", items: 1, total: 175, status: "dispatched", time: "Hace 1 hora" },
];

const dailySales = [
  { day: "Lun", value: 12500 },
  { day: "Mar", value: 9800 },
  { day: "Mié", value: 15200 },
  { day: "Jue", value: 11400 },
  { day: "Vie", value: 18900 },
  { day: "Sáb", value: 21300 },
  { day: "Dom", value: 8100 },
];

const hourlySales = [
  0, 0, 0, 0, 0, 0, 2, 5, 12, 18, 15, 10,
  8, 14, 16, 12, 9, 7, 11, 8, 4, 2, 1, 0,
];

const ordersByStatus = [
  { label: "Pendiente", count: 8, color: "bg-amber-500", pct: 6 },
  { label: "Listo", count: 16, color: "bg-sky-500", pct: 11 },
  { label: "Despachado", count: 118, color: "bg-emerald-500", pct: 83 },
  { label: "Cancelado", count: 4, color: "bg-red-500", pct: 3 },
];

const topProducts = [
  { name: "Acetaminofén 500mg", qty: 145, total: 21750 },
  { name: "Ibuprofeno 400mg", qty: 98, total: 19600 },
  { name: "Amoxicilina 500mg", qty: 67, total: 30150 },
  { name: "Omeprazol 20mg", qty: 54, total: 9720 },
  { name: "Loratadina 10mg", qty: 48, total: 5760 },
  { name: "Metformina 850mg", qty: 42, total: 8400 },
  { name: "Enalapril 10mg", qty: 38, total: 6650 },
  { name: "Diclofenac 50mg", qty: 35, total: 4550 },
  { name: "Complejo B", qty: 31, total: 7750 },
  { name: "Cetirizina 10mg", qty: 28, total: 4900 },
];

const topCustomers = [
  { name: "Ana Reyes", orders: 23, total: 15800 },
  { name: "María López", orders: 18, total: 12400 },
  { name: "Pedro Almonte", orders: 15, total: 9800 },
  { name: "Rosa Méndez", orders: 12, total: 8500 },
  { name: "José García", orders: 11, total: 7200 },
  { name: "Carmen Díaz", orders: 9, total: 6100 },
  { name: "Luis Batista", orders: 8, total: 5400 },
  { name: "Laura Sánchez", orders: 7, total: 4900 },
  { name: "Miguel Torres", orders: 6, total: 3800 },
  { name: "Carlos Marte", orders: 5, total: 3200 },
];

const salesByCategory = [
  { name: "Analgésicos", pct: 35 },
  { name: "Antibióticos", pct: 22 },
  { name: "Gastrointestinal", pct: 18 },
  { name: "Cardiovascular", pct: 15 },
  { name: "Vitaminas", pct: 10 },
];

const statusBadge: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  ready: "bg-sky-50 text-sky-700 border-sky-200",
  dispatched: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  ready: "Listo",
  dispatched: "Despachado",
  cancelled: "Cancelado",
};

type DateRange = "today" | "week" | "month" | "year";

const dateRanges: { key: DateRange; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Esta Semana" },
  { key: "month", label: "Este Mes" },
  { key: "year", label: "Este Año" },
];

function formatCurrency(value: number) {
  return `RD$${value.toLocaleString("es-DO")}`;
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>("month");

  const maxDaily = Math.max(...dailySales.map((d) => d.value));
  const maxHourly = Math.max(...hourlySales);
  const maxProductQty = topProducts[0]?.qty || 1;

  return (
    <div className="space-y-6">
      {/* Header + date filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Resumen de actividad</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {dateRanges.map((r) => (
            <button
              key={r.key}
              onClick={() => setDateRange(r.key)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                dateRange === r.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Ventas totales"
          value={formatCurrency(stats.totalSales)}
          icon={DollarSign}
          trend={{ value: 15, label: "vs periodo anterior" }}
          color="green"
        />
        <StatCard
          label="Pedidos"
          value={stats.totalOrders}
          icon={ShoppingCart}
          trend={{ value: 8, label: "vs periodo anterior" }}
          color="sky"
        />
        <StatCard
          label="Promedio/Pedido"
          value={formatCurrency(stats.avgPerOrder)}
          icon={TrendingUp}
          color="violet"
        />
        <StatCard
          label="Clientes únicos"
          value={stats.uniqueCustomers}
          icon={Users}
          color="amber"
        />
        <StatCard
          label="Pendientes"
          value={stats.pendingOrders}
          icon={Clock}
          color="red"
        />
      </div>

      {/* Charts row 1: Sales by day + Orders by status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales by day bar chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Ventas por día</h2>
          <div className="h-56 flex items-end gap-3">
            {dailySales.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-[11px] font-medium text-slate-500">
                  {formatCurrency(d.value)}
                </span>
                <div
                  className="w-full bg-primary rounded-t-md hover:bg-primary-dark transition-colors cursor-default"
                  style={{ height: `${(d.value / maxDaily) * 160}px` }}
                />
                <span className="text-xs text-slate-500 font-medium">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Orders by status donut */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Pedidos por estado</h2>
          {/* Visual donut */}
          <div className="relative w-40 h-40 mx-auto mb-5">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              {(() => {
                let offset = 0;
                const colors = ["#f59e0b", "#0ea5e9", "#22c55e", "#ef4444"];
                return ordersByStatus.map((s, i) => {
                  const dash = s.pct;
                  const el = (
                    <circle
                      key={s.label}
                      cx="18" cy="18" r="14"
                      fill="none"
                      stroke={colors[i]}
                      strokeWidth="5"
                      strokeDasharray={`${dash} ${100 - dash}`}
                      strokeDashoffset={-offset}
                      className="transition-all duration-500"
                    />
                  );
                  offset += dash;
                  return el;
                });
              })()}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-900">{stats.totalOrders}</span>
              <span className="text-xs text-slate-400">pedidos</span>
            </div>
          </div>
          {/* Legend */}
          <div className="space-y-2">
            {ordersByStatus.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                  <span className="text-slate-600">{s.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{s.count}</span>
                  <span className="text-slate-400 text-xs">({s.pct}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row 2: Weekday sales + Hourly activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by weekday */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Ventas por día de la semana</h2>
          <div className="space-y-2.5">
            {dailySales.map((d) => (
              <div key={d.day} className="flex items-center gap-3">
                <span className="text-sm text-slate-500 w-10 shrink-0">{d.day}</span>
                <div className="flex-1 h-7 bg-slate-50 rounded-md overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-md flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${(d.value / maxDaily) * 100}%` }}
                  >
                    <span className="text-[11px] text-white font-medium">
                      {formatCurrency(d.value)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hourly activity */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Actividad por hora del día</h2>
          <div className="h-40 flex items-end gap-[3px]">
            {hourlySales.map((val, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full rounded-t-sm transition-colors cursor-default relative"
                  data-bar
                  style={{ height: `${maxHourly > 0 ? (val / maxHourly) * 120 : 0}px`, minHeight: val > 0 ? "4px" : "0", backgroundColor: "var(--primary)", opacity: 0.7 }}
                >
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {val} pedidos
                  </div>
                </div>
                {i % 3 === 0 && (
                  <span className="text-[10px] text-slate-400">{String(i).padStart(2, "0")}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-slate-400">
            <span>12am</span>
            <span>6am</span>
            <span>12pm</span>
            <span>6pm</span>
            <span>12am</span>
          </div>
        </div>
      </div>

      {/* Top 10 products (horizontal bars) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Top 10 Productos</h2>
        <div className="space-y-2.5">
          {topProducts.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3">
              <span className={clsx(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                i === 0 ? "bg-amber-100 text-amber-700" :
                i === 1 ? "bg-slate-200 text-slate-600" :
                i === 2 ? "bg-orange-100 text-orange-700" :
                "bg-slate-50 text-slate-400"
              )}>
                {i + 1}
              </span>
              <span className="text-sm text-slate-700 w-44 shrink-0 truncate">{p.name}</span>
              <div className="flex-1 h-6 bg-slate-50 rounded overflow-hidden">
                <div
                  className="h-full rounded flex items-center justify-end pr-2 transition-all"
                  style={{ width: `${(p.qty / maxProductQty) * 100}%`, backgroundColor: "var(--primary)", opacity: 0.85 }}
                >
                  <span className="text-[11px] text-white font-medium">{p.qty} uds</span>
                </div>
              </div>
              <span className="text-sm font-semibold text-slate-700 w-24 text-right shrink-0">
                {formatCurrency(p.total)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top customers + Top products list + Agent stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top customers */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-primary px-5 py-3">
            <h2 className="font-semibold text-white">Top Clientes</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {topCustomers.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={clsx(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    i === 0 ? "bg-amber-100 text-amber-700" :
                    i === 1 ? "bg-slate-200 text-slate-600" :
                    i === 2 ? "bg-orange-100 text-orange-700" :
                    "bg-slate-50 text-slate-400"
                  )}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.orders} pedidos</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-700">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Categorías más vendidas</h2>
          <div className="space-y-3">
            {salesByCategory.map((cat) => (
              <div key={cat.name}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-700 font-medium">{cat.name}</span>
                  <span className="text-slate-500 font-semibold">{cat.pct}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${cat.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Agent performance */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-3">Rendimiento del agente</h3>
            <div className="space-y-3">
              {[
                { label: "Resueltos por bot", value: "78%", icon: Bot, color: "text-violet-600 bg-violet-50" },
                { label: "Transferidos a manual", value: "22%", icon: User, color: "text-sky-600 bg-sky-50" },
                { label: "Tiempo promedio respuesta", value: "3.2s", icon: Clock, color: "text-amber-600 bg-amber-50" },
                { label: "Pedidos completados por bot", value: "65%", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                      <m.icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm text-slate-600">{m.label}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Pedidos recientes</h2>
            <a href="/orders" className="text-xs text-primary font-medium">
              Ver todos
            </a>
          </div>
          <div className="divide-y divide-slate-50">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Package className="w-4 h-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{order.customer}</p>
                    <p className="text-[11px] text-slate-400">{order.id} · {order.time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-700">{formatCurrency(order.total)}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadge[order.status]}`}>
                    {statusLabel[order.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
