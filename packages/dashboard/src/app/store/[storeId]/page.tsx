"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  Pill,
  Loader2,
  Clock,
  PackageX,
} from "lucide-react";
import {
  fetchStore,
  fetchProducts,
  loadCart,
  saveCart,
  cartCount,
  cartTotal,
  formatMoney,
  type StoreInfo,
  type Product,
  type CartItem,
} from "@/lib/storefront";

export default function StorefrontPage() {
  const params = useParams();
  const storeId = String(params.storeId);

  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  // Load cart once on mount (client-only).
  useEffect(() => {
    setCart(loadCart(storeId));
  }, [storeId]);

  // Persist cart on every change.
  useEffect(() => {
    saveCart(storeId, cart);
  }, [storeId, cart]);

  // Load store info.
  useEffect(() => {
    fetchStore(storeId)
      .then(setStore)
      .catch(() => setNotFound(true));
  }, [storeId]);

  // Load / search products (debounced).
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSearch = useCallback(
    (q: string) => {
      setSearching(true);
      fetchProducts(storeId, q, { limit: 48 })
        .then((r) => setProducts(r.products))
        .catch(() => setProducts([]))
        .finally(() => {
          setLoading(false);
          setSearching(false);
        });
    },
    [storeId],
  );

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(query), query ? 300 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, runSearch]);

  function addToCart(p: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) {
        return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { id: p.id, name: p.name, price: p.price, qty: 1, image_url: p.image_url }];
    });
  }

  function setQty(id: number, qty: number) {
    setCart((prev) =>
      qty <= 0 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, qty } : i)),
    );
  }

  const count = cartCount(cart);
  const total = cartTotal(cart);
  const currency = store?.currency || "DOP";

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center">
          <PackageX className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h1 className="text-lg font-semibold text-slate-800">Tienda no disponible</h1>
          <p className="text-sm text-slate-500 mt-1">
            Esta farmacia no existe o no está activa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
            <Pill className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-slate-900 truncate">
              {store?.name || "Cargando…"}
            </h1>
            {store?.business_hours && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="w-3 h-3" />
                {store.business_hours}
              </div>
            )}
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:inline">Carrito</span>
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                {count}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar un producto…"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>
        </div>
      </header>

      {/* Catalog */}
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center text-slate-500">
            <PackageX className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            No se encontraron productos{query ? ` para “${query}”` : ""}.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map((p) => {
              const inCart = cart.find((i) => i.id === p.id);
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col"
                >
                  <ProductImage product={p} />
                  <div className="p-3 flex flex-col flex-1">
                    <div className="text-xs text-emerald-600 font-medium mb-0.5 truncate">
                      {p.category}
                    </div>
                    <div className="text-sm text-slate-800 font-medium leading-snug line-clamp-2 min-h-[2.5rem]">
                      {p.name}
                    </div>
                    <div className="mt-2 font-semibold text-slate-900">
                      {formatMoney(p.price, currency)}
                    </div>
                    <div className="mt-2">
                      {inCart ? (
                        <Stepper
                          qty={inCart.qty}
                          onChange={(q) => setQty(p.id, q)}
                        />
                      ) : (
                        <button
                          onClick={() => addToCart(p)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Agregar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Mobile sticky checkout bar */}
      {count > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 max-w-5xl mx-auto z-30 flex items-center justify-between px-5 py-3.5 rounded-xl bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingCart className="w-5 h-5" />
            {count} {count === 1 ? "artículo" : "artículos"}
          </span>
          <span className="font-semibold">{formatMoney(total, currency)}</span>
        </button>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <CartDrawer
          storeId={storeId}
          cart={cart}
          currency={currency}
          onClose={() => setCartOpen(false)}
          onSetQty={setQty}
        />
      )}
    </div>
  );
}

function ProductImage({ product }: { product: Product }) {
  const [broken, setBroken] = useState(false);
  if (!product.image_url || broken) {
    return (
      <div className="aspect-square bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center">
        <Pill className="w-10 h-10 text-emerald-200" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={product.image_url}
      alt={product.name}
      className="aspect-square object-cover w-full bg-white"
      onError={() => setBroken(true)}
    />
  );
}

function Stepper({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50">
      <button
        onClick={() => onChange(qty - 1)}
        className="p-2 text-emerald-700 hover:bg-emerald-100 rounded-l-lg"
        aria-label="Quitar uno"
      >
        {qty === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
      </button>
      <span className="text-sm font-semibold text-emerald-800">{qty}</span>
      <button
        onClick={() => onChange(qty + 1)}
        className="p-2 text-emerald-700 hover:bg-emerald-100 rounded-r-lg"
        aria-label="Agregar uno"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function CartDrawer({
  storeId,
  cart,
  currency,
  onClose,
  onSetQty,
}: {
  storeId: string;
  cart: CartItem[];
  currency: string;
  onClose: () => void;
  onSetQty: (id: number, qty: number) => void;
}) {
  const total = cartTotal(cart);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white w-full max-w-md h-full flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Tu carrito
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6">
            <ShoppingCart className="w-10 h-10 mb-2 text-slate-300" />
            Tu carrito está vacío
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex gap-3 items-center">
                  <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <Pill className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 font-medium line-clamp-2 leading-snug">
                      {item.name}
                    </div>
                    <div className="text-sm text-slate-500">
                      {formatMoney(item.price, currency)}
                    </div>
                  </div>
                  <div className="w-28 shrink-0">
                    <Stepper qty={item.qty} onChange={(q) => onSetQty(item.id, q)} />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between text-slate-900">
                <span className="font-medium">Total</span>
                <span className="text-lg font-bold">{formatMoney(total, currency)}</span>
              </div>
              <Link
                href={`/store/${storeId}/checkout`}
                className="block w-full text-center py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
              >
                Continuar al pedido
              </Link>
              <p className="text-xs text-center text-slate-400">
                Pagas al recibir o en la farmacia
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
