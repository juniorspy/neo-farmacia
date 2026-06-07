"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { printOrderReceipt, getPrinterInfo } from "@/lib/printer";

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

interface OrderActionResult {
  success: boolean;
  orderCancelled?: boolean;
  notified: boolean;
  via: string | null;
  skippedReason?: string;
}

function notifySkippedText(reason?: string): string {
  switch (reason) {
    case "manual_mode":
      return "⚠️ Chat en modo manual — avísale tú al cliente.";
    case "no_customer":
      return "⚠️ Pedido sin WhatsApp asociado — no se pudo avisar.";
    case "send_failed":
      return "⚠️ No se pudo enviar el aviso por WhatsApp.";
    default:
      return "";
  }
}

export default function OrdersPage() {
  const { currentStore } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectingLine, setRejectingLine] = useState<number | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Per-pharmacy print mode (settings → Impresión): manual | auto | off
  const [printMode, setPrintMode] = useState<"manual" | "auto" | "off">("manual");
  const seenOrders = useRef<Set<number>>(new Set());
  const seenSeeded = useRef(false);

  const storeId = currentStore?.id;

  useEffect(() => {
    if (!storeId) return;
    seenOrders.current = new Set();
    seenSeeded.current = false;
    api
      .get<{ print_mode?: "manual" | "auto" | "off" }>(`/api/v1/stores/${storeId}`)
      .then((s) => setPrintMode(s.print_mode || "manual"))
      .catch(() => {});
  }, [storeId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const loadOrders = useCallback(async () => {
    if (!storeId) return;
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
    } catch {
      alert("Error actualizando estado");
    }
  }

  // ✗ pattern: item not available → remove from order + notify customer (AI/template)
  async function rejectItem(order: Order, lineId: number, lineName: string) {
    if (
      !confirm(
        `¿Marcar "${lineName}" como no disponible?\nSe retirará del pedido y se avisará al cliente por WhatsApp.`
      )
    )
      return;
    setRejectingLine(lineId);
    try {
      const res = await api.post<OrderActionResult>(
        `/api/v1/stores/${storeId}/orders/${order.id}/items/${lineId}/reject`
      );
      const base = res.orderCancelled
        ? "Pedido cancelado (era el único producto)."
        : "Producto retirado del pedido.";
      setNotice(
        res.notified
          ? `${base} Cliente avisado por WhatsApp ✓`
          : `${base} ${notifySkippedText(res.skippedReason)}`
      );
      await loadOrders();
      if (res.orderCancelled) {
        setSelectedOrder(null);
      } else {
        await loadOrderDetail(order);
      }
    } catch {
      alert("Error al retirar el producto");
    } finally {
      setRejectingLine(null);
    }
  }

  // Despachar = el pedido ya pasó por caja (la factura la emite SU POS)
  async function dispatchOrder(order: Order) {
    if (
      !confirm(
        `¿Despachar el pedido ${order.name}?\nConfirma que ya pasó por caja. Se avisará al cliente por WhatsApp.`
      )
    )
      return;
    setDispatching(true);
    try {
      const res = await api.post<OrderActionResult>(
        `/api/v1/stores/${storeId}/orders/${order.id}/dispatch`
      );
      setNotice(
        res.notified
          ? "Pedido despachado. Cliente avisado por WhatsApp 🛵"
          : `Pedido despachado. ${notifySkippedText(res.skippedReason)}`
      );
      await loadOrders();
      setSelectedOrder(null);
    } catch {
      alert("Error al despachar");
    } finally {
      setDispatching(false);
    }
  }

  // Auto-print (print_mode = 'auto'): poll for new orders and print the
  // picking ticket without a click. First poll only seeds the seen-set so we
  // never print the backlog.
  const autoPrintTick = useCallback(async () => {
    if (!storeId) return;
    try {
      const all = await api.get<Order[]>(`/api/v1/stores/${storeId}/orders`);
      if (!seenSeeded.current) {
        all.forEach((o) => seenOrders.current.add(o.id));
        seenSeeded.current = true;
        return;
      }
      const fresh = all.filter((o) => !seenOrders.current.has(o.id));
      if (fresh.length === 0) return;
      fresh.forEach((o) => seenOrders.current.add(o.id));
      await loadOrders();

      const printable = fresh.filter((o) => o.status === "pending" || o.status === "ready");
      if (printable.length === 0) return;
      if (!getPrinterInfo()) {
        setNotice(
          `${printable.length} pedido(s) nuevo(s). Empareja la impresora en Configuración para imprimir automáticamente.`
        );
        return;
      }
      for (const o of printable) {
        try {
          const detail = await api.get<Order>(`/api/v1/stores/${storeId}/orders/${o.id}`);
          await printOrderReceipt({
            orderName: detail.name,
            customer: detail.customer,
            date: detail.date,
            lines: (detail.lines || [])
              .filter((l) => l.qty > 0)
              .map((l) => ({ name: l.name, qty: l.qty, subtotal: l.subtotal })),
            total: detail.total,
            storeName: currentStore?.name || "Neo Farmacia",
          });
          setNotice(`🖨️ Pedido ${detail.name} impreso automáticamente`);
        } catch {
          setNotice(`⚠️ Pedido nuevo ${o.name} — no se pudo imprimir automáticamente`);
        }
      }
    } catch {
      // silent — next tick retries
    }
  }, [storeId, loadOrders, currentStore?.name]);

  useEffect(() => {
    if (printMode !== "auto" || !storeId) return;
    autoPrintTick();
    const t = setInterval(autoPrintTick, 20000);
    return () => clearInterval(t);
  }, [printMode, storeId, autoPrintTick]);

  async function printReceipt(order: Order) {
    if (!getPrinterInfo()) {
      alert("No hay impresora emparejada. Ve a Configuración para emparejar.");
      return;
    }
    try {
      await printOrderReceipt({
        orderName: order.name,
        customer: order.customer,
        date: order.date,
        lines: (order.lines || []).map((l) => ({
          name: l.name,
          qty: l.qty,
          subtotal: l.subtotal,
        })),
        total: order.total,
        storeName: currentStore?.name || "Neo Farmacia",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error imprimiendo");
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

      {notice && (
        <div className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          {notice}
        </div>
      )}

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
                        {selectedOrder.lines.map((line) => {
                          const rejected = line.qty <= 0;
                          const canReject =
                            !rejected &&
                            (selectedOrder.status === "pending" || selectedOrder.status === "ready");
                          return (
                            <div key={line.id} className="flex items-center justify-between gap-2">
                              <span
                                className={clsx(
                                  rejected
                                    ? "text-slate-400 line-through"
                                    : "text-slate-700"
                                )}
                              >
                                {rejected ? line.name : `${line.qty}x ${line.name}`}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className={clsx("text-slate-500", rejected && "line-through text-slate-300")}>
                                  {rejected ? "no disponible" : `RD$${line.subtotal.toLocaleString()}`}
                                </span>
                                {canReject && (
                                  <button
                                    onClick={() => rejectItem(selectedOrder, line.id, line.name)}
                                    disabled={rejectingLine !== null}
                                    className="p-1 rounded text-red-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                    title="No disponible — retirar del pedido y avisar al cliente"
                                  >
                                    {rejectingLine === line.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <XCircle className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
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
                  <div className="mt-5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => dispatchOrder(selectedOrder)}
                        disabled={dispatching}
                        className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {dispatching ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Truck className="w-4 h-4" />
                        )}
                        Despachar
                      </button>
                      {printMode !== "off" && (
                        <button
                          onClick={() => printReceipt(selectedOrder)}
                          className="py-2 px-3 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
                          title="Imprimir recibo"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 text-center">
                      Despachar = ya pasó por caja · se avisa al cliente por WhatsApp
                    </p>
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
