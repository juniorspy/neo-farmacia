// Public storefront client + cart helpers. No JWT — the storefront is a
// customer-facing surface (like the /call page), so it talks to the public
// /api/v1/storefront endpoints directly and keeps the cart in localStorage.

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface StoreInfo {
  store_id: string;
  name: string;
  currency: string;
  delivery_info: string;
  business_hours: string;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
  barcode: string | null;
  image_url: string | null;
}

export interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
  image_url: string | null;
}

export interface OrderResult {
  orderId: number;
  name: string | null;
  total: number;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchStore(storeId: string): Promise<StoreInfo> {
  return getJson<StoreInfo>(`/api/v1/storefront/${storeId}`);
}

export function fetchProducts(
  storeId: string,
  q = "",
  opts: { limit?: number; offset?: number } = {},
): Promise<{ total: number; products: Product[] }> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return getJson(`/api/v1/storefront/${storeId}/products${qs ? `?${qs}` : ""}`);
}

export async function placeOrder(
  storeId: string,
  payload: {
    customer: { name: string; phone: string; address: string };
    items: Array<{ productId: number; qty: number }>;
    note?: string;
  },
): Promise<OrderResult> {
  const res = await fetch(`${API}/api/v1/storefront/${storeId}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || `request failed: ${res.status}`);
  }
  return res.json() as Promise<OrderResult>;
}

// ── Cart (localStorage, per store) ──

const cartKey = (storeId: string) => `nf_cart_${storeId}`;

export function loadCart(storeId: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(cartKey(storeId));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(storeId: string, items: CartItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(cartKey(storeId), JSON.stringify(items));
}

export function clearCart(storeId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(cartKey(storeId));
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.qty, 0);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

export function formatMoney(amount: number, currency = "DOP"): string {
  const symbol = currency === "DOP" ? "RD$" : "$";
  return `${symbol}${amount.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
