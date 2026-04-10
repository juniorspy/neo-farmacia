"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Package, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
  barcode: string | null;
  hasExpiry: boolean;
}

export default function ProductsPage() {
  const { currentStore } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const storeId = currentStore?.id || "store_leo";

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      const data = await api.get<Product[]>(`/api/v1/stores/${storeId}/products`, params);
      setProducts(data);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, debouncedSearch]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Productos</h1>
        <p className="text-sm text-slate-500 mt-1">Inventario desde Odoo</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Producto</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Precio</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Código</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    No hay productos
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const lowStock = product.stock > 0 && product.stock < 10;
                  return (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                            <Package className="w-4 h-4 text-slate-500" />
                          </div>
                          <span className="font-medium text-slate-900">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{product.category}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-700">RD${product.price}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className={`inline-flex items-center gap-1 font-medium ${lowStock ? "text-red-600" : product.stock === 0 ? "text-slate-300" : "text-slate-700"}`}>
                          {lowStock && <AlertTriangle className="w-3.5 h-3.5" />}
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-400 font-mono text-xs">{product.barcode || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
