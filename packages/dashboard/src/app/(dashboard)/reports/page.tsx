"use client";

import { useState, useEffect } from "react";
import { clsx } from "clsx";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  Bot,
  User,
  Sparkles,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

// ── Types ──

interface ChartsData {
  dailySales: { date: string; value: number }[];
  weekdaySales: { day: string; value: number }[];
  hourlyActivity: number[];
  ordersByStatus: { label: string; count: number; color: string }[];
  topProducts: { name: string; qty: number; total: number }[];
  topCustomers: { name: string; orders: number; total: number }[];
}

const emptyCharts: ChartsData = {
  dailySales: [],
  weekdaySales: [],
  hourlyActivity: new Array(24).fill(0),
  ordersByStatus: [],
  topProducts: [],
  topCustomers: [],
};

type DateRange = "today" | "week" | "month" | "year";

const dateRanges: { key: DateRange; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Esta Semana" },
  { key: "month", label: "Este Mes" },
  { key: "year", label: "Este Año" },
];

function fmt(value: number) {
  return `RD$${value.toLocaleString("es-DO")}`;
}

function rankBadge(i: number) {
  return clsx(
    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
    i === 0 ? "bg-amber-100 text-amber-700" :
    i === 1 ? "bg-slate-200 text-slate-600" :
    i === 2 ? "bg-orange-100 text-orange-700" :
    "bg-slate-50 text-slate-400"
  );
}

interface SummaryStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalRevenue: number;
  avgPerOrder: number;
  totalCustomers: number;
}

interface AgentStats {
  botMessages: number;
  agentMessages: number;
  totalMessages: number;
  botPct: number;
  agentPct: number;
}

export default function ReportsPage() {
  const { currentStore } = useStore();
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [agent, setAgent] = useState<AgentStats | null>(null);

  const storeId = currentStore?.id || "store_leo";

  const [charts, setCharts] = useState<ChartsData>(emptyCharts);

  useEffect(() => {
    api.get<SummaryStats>(`/api/v1/stores/${storeId}/stats/summary`).then(setSummary).catch(() => {});
    api.get<AgentStats>(`/api/v1/stores/${storeId}/stats/agent`).then(setAgent).catch(() => {});
    api.get<ChartsData>(`/api/v1/stores/${storeId}/stats/charts`).then(setCharts).catch(() => {});
  }, [storeId]);

  const totalSales = summary?.totalRevenue || 0;
  const totalOrders = summary?.totalOrders || 0;
  const completedOrders = summary?.completedOrders || 0;
  const avgPerOrder = summary?.avgPerOrder || 0;
  const uniqueCustomers = summary?.totalCustomers || 0;

  const { dailySales: dailySalesData, weekdaySales, hourlyActivity: hourlySales, ordersByStatus, topProducts, topCustomers } = charts;

  const maxDaily = Math.max(...(dailySalesData.length > 0 ? dailySalesData.map((d) => d.value) : [1]));
  const maxHourly = Math.max(...hourlySales, 1);
  const maxWeekday = Math.max(...(weekdaySales.length > 0 ? weekdaySales.map((d) => d.value) : [1]));
  const maxProductTotal = topProducts[0]?.total || 1;

  return (
    <div className="space-y-6">
      {/* Header + date filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Estadísticas</h1>
          <p className="text-sm text-slate-500 mt-1">Análisis de ventas y rendimiento</p>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors"
            title="Próximamente"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Análisis
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Ventas totales"
          value={fmt(totalSales)}
          icon={DollarSign}
          trend={{ value: 15, label: "vs periodo anterior" }}
          color="green"
        />
        <StatCard
          label="Pedidos"
          value={totalOrders}
          icon={ShoppingCart}
          trend={{ value: 8, label: "vs periodo anterior" }}
          color="sky"
        />
        <StatCard
          label="Completados"
          value={completedOrders}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          label="Promedio/Pedido"
          value={fmt(avgPerOrder)}
          icon={TrendingUp}
          color="violet"
        />
        <StatCard
          label="Clientes únicos"
          value={uniqueCustomers}
          icon={Users}
          color="amber"
        />
      </div>

      {/* Row 1: Sales line chart + Orders donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales by day */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Ventas por día</h2>
          {/* Line chart approximation with bars + line */}
          <div className="h-56 flex items-end gap-3 relative">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-b border-slate-100 w-full" />
              ))}
            </div>
            {dailySalesData.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-2 relative z-10">
                <span className="text-[11px] font-medium text-slate-500">
                  {fmt(d.value)}
                </span>
                <div
                  className="w-full bg-primary rounded-t-md hover:bg-primary-dark transition-colors cursor-default"
                  style={{ height: `${(d.value / maxDaily) * 160}px` }}
                />
                <span className="text-xs text-slate-500 font-medium">{d.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donut: orders by status */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Pedidos por estado</h2>
          <div className="relative w-40 h-40 mx-auto mb-5">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              {(() => {
                let offset = 0;
                const total = ordersByStatus.reduce((sum, x) => sum + x.count, 0) || 1;
                return ordersByStatus.map((s) => {
                  const dash = (s.count / total) * 100;
                  const el = (
                    <circle
                      key={s.label}
                      cx="18" cy="18" r="14"
                      fill="none"
                      stroke={s.color}
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
              <span className="text-2xl font-bold text-slate-900">{totalOrders}</span>
              <span className="text-xs text-slate-400">pedidos</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {ordersByStatus.map((s) => (
              <div key={s.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-slate-600">{s.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{s.count}</span>
                  <span className="text-slate-400 text-xs">({Math.round((s.count / (ordersByStatus.reduce((sum, x) => sum + x.count, 0) || 1)) * 100)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Weekday sales + Hourly activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by weekday */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Ventas por día de la semana</h2>
          <div className="space-y-2.5">
            {weekdaySales.map((d) => (
              <div key={d.day} className="flex items-center gap-3">
                <span className="text-sm text-slate-500 w-10 shrink-0 font-medium">{d.day}</span>
                <div className="flex-1 h-8 bg-slate-50 rounded-lg overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-lg flex items-center justify-end pr-2.5 transition-all"
                    style={{ width: `${(d.value / maxWeekday) * 100}%` }}
                  >
                    <span className="text-[11px] text-white font-semibold">
                      {fmt(d.value)}
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
          <div className="h-44 flex items-end gap-[3px]">
            {hourlySales.map((val, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full rounded-t-sm transition-colors cursor-default relative"
                  style={{
                    height: `${maxHourly > 0 ? (val / maxHourly) * 130 : 0}px`,
                    minHeight: val > 0 ? "4px" : "0",
                    backgroundColor: "var(--primary)",
                    opacity: 0.7,
                  }}
                >
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {String(i).padStart(2, "0")}:00 — {val} pedidos
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

      {/* Row 3: Top 10 Products (horizontal bar) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Top 10 Productos</h2>
        <div className="space-y-2.5">
          {topProducts.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3">
              <span className={rankBadge(i)}>{i + 1}</span>
              <span className="text-sm text-slate-700 w-44 shrink-0 truncate font-medium">{p.name}</span>
              <div className="flex-1 h-7 bg-slate-50 rounded overflow-hidden">
                <div
                  className="h-full rounded flex items-center justify-end pr-2 transition-all"
                  style={{
                    width: `${(p.total / maxProductTotal) * 100}%`,
                    backgroundColor: "var(--sidebar-bg)",
                  }}
                >
                  <span className="text-[11px] text-white font-medium">{p.qty} uds</span>
                </div>
              </div>
              <span className="text-sm font-bold text-slate-700 w-24 text-right shrink-0">
                {fmt(p.total)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Row 4: Top Customers + Top Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top customers */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-primary px-5 py-3.5">
            <h2 className="font-semibold text-white">Top Clientes</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {topCustomers.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={rankBadge(i)}>{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.orders} pedidos</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-700">{fmt(c.total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent performance + categories */}
        <div className="space-y-6">
          {/* Agent performance */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Rendimiento del agente</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-violet-50 rounded-xl p-4 text-center">
                <Bot className="w-6 h-6 text-violet-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-violet-700">{agent?.botPct || 0}%</p>
                <p className="text-xs text-violet-500">Resueltos por bot</p>
              </div>
              <div className="bg-sky-50 rounded-xl p-4 text-center">
                <User className="w-6 h-6 text-sky-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-sky-700">{agent?.agentPct || 0}%</p>
                <p className="text-xs text-sky-500">Manual</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Consultas resueltas sin intervención", value: "78%", dot: "bg-emerald-500" },
                { label: "Pedidos completados por bot", value: "65%", dot: "bg-primary" },
                { label: "Transferidos a manual", value: "22%", dot: "bg-amber-500" },
                { label: "Tiempo promedio de respuesta", value: "3.2s", dot: "bg-violet-500" },
                { label: "Tasa de satisfacción", value: "92%", dot: "bg-emerald-500" },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${m.dot}`} />
                    <span className="text-sm text-slate-600">{m.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Categorías más vendidas</h2>
            <div className="space-y-3">
              {[
                { name: "Analgésicos", pct: 35, total: 34020 },
                { name: "Antibióticos", pct: 22, total: 21384 },
                { name: "Gastrointestinal", pct: 18, total: 17496 },
                { name: "Cardiovascular", pct: 15, total: 14580 },
                { name: "Vitaminas", pct: 10, total: 9720 },
              ].map((cat) => (
                <div key={cat.name}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-slate-700 font-medium">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs">{fmt(cat.total)}</span>
                      <span className="text-slate-600 font-semibold w-10 text-right">{cat.pct}%</span>
                    </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
