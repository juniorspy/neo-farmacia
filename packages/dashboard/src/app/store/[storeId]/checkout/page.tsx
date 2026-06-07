"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Pill,
  Loader2,
  CheckCircle2,
  ShoppingCart,
  Truck,
} from "lucide-react";
import {
  fetchStore,
  loadCart,
  clearCart,
  cartTotal,
  formatMoney,
  placeOrder,
  type StoreInfo,
  type CartItem,
  type OrderResult,
} from "@/lib/storefront";

export default function CheckoutPage() {
  const params = useParams();
  const storeId = String(params.storeId);

  const [store, setStore] = useState<StoreInfo | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<OrderResult | null>(null);

  useEffect(() => {
    setCart(loadCart(storeId));
    setHydrated(true);
    fetchStore(storeId).then(setStore).catch(() => {});
  }, [storeId]);

  const currency = store?.currency || "DOP";
  const total = cartTotal(cart);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError("Completa nombre, teléfono y dirección.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await placeOrder(storeId, {
        customer: { name: name.trim(), phone: phone.trim(), address: address.trim() },
        items: cart.map((i) => ({ productId: i.id, qty: i.qty })),
        note: note.trim() || undefined,
      });
      clearCart(storeId);
      setDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Confirmation ──
  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">¡Pedido recibido!</h1>
          <p className="text-sm text-slate-500 mt-2">
            {store?.name} recibió tu pedido
            {done.name ? ` (${done.name})` : ""}. Te contactarán al{" "}
            <span className="font-medium text-slate-700">{phone}</span> para coordinar
            la entrega.
          </p>
          <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Total a pagar al recibir</span>
            <span className="font-bold text-slate-900">{formatMoney(done.total, currency)}</span>
          </div>
          <Link
            href={`/store/${storeId}`}
            className="mt-6 inline-block w-full py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
          >
            Volver a la tienda
          </Link>
        </div>
      </div>
    );
  }

  // ── Empty cart guard ──
  if (hydrated && cart.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h1 className="text-lg font-semibold text-slate-800">Tu carrito está vacío</h1>
          <Link
            href={`/store/${storeId}`}
            className="mt-4 inline-block px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Ir a la tienda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={`/store/${storeId}`}
            className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold text-slate-900">Finalizar pedido</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Order summary */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
            Tu pedido
          </div>
          <div className="divide-y divide-slate-100">
            {cart.map((item) => (
              <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <Pill className="w-4 h-4 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 line-clamp-1">{item.name}</div>
                  <div className="text-xs text-slate-500">
                    {item.qty} × {formatMoney(item.price, currency)}
                  </div>
                </div>
                <div className="text-sm font-medium text-slate-900">
                  {formatMoney(item.price * item.qty, currency)}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="font-medium text-slate-700">Total</span>
            <span className="text-lg font-bold text-slate-900">
              {formatMoney(total, currency)}
            </span>
          </div>
        </section>

        {/* Customer form */}
        <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="text-sm font-medium text-slate-700">Datos de entrega</div>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Nombre *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
              placeholder="Tu nombre"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Teléfono / WhatsApp *</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
              placeholder="809 555 1234"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Dirección de entrega *</span>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm resize-none"
              placeholder="Calle, número, sector, referencia"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Nota (opcional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
              placeholder="Ej: tocar el timbre, edificio azul…"
            />
          </label>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {error}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-emerald-800">
            <Truck className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-xs">
              Pagas <span className="font-semibold">al recibir</span> o en la farmacia.
              {store?.delivery_info ? ` ${store.delivery_info}` : ""}
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirmar pedido · {formatMoney(total, currency)}
          </button>
        </form>
      </main>
    </div>
  );
}
