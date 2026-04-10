"use client";

import { useState } from "react";
import { Search, Package, AlertTriangle } from "lucide-react";

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
  expiry: string | null;
  lowStock: boolean;
}

const mockProducts: Product[] = [
  { id: 1, name: "Acetaminofén 500mg", price: 150, stock: 245, category: "Analgésicos", expiry: "2027-03", lowStock: false },
  { id: 2, name: "Ibuprofeno 400mg", price: 200, stock: 180, category: "Analgésicos", expiry: "2027-01", lowStock: false },
  { id: 3, name: "Amoxicilina 500mg", price: 450, stock: 12, category: "Antibióticos", expiry: "2026-08", lowStock: true },
  { id: 4, name: "Omeprazol 20mg", price: 180, stock: 95, category: "Gastrointestinal", expiry: "2027-05", lowStock: false },
  { id: 5, name: "Loratadina 10mg", price: 120, stock: 8, category: "Antialérgicos", expiry: "2026-11", lowStock: true },
  { id: 6, name: "Metformina 850mg", price: 200, stock: 150, category: "Diabetes", expiry: "2027-06", lowStock: false },
  { id: 7, name: "Enalapril 10mg", price: 175, stock: 67, category: "Cardiovascular", expiry: "2026-12", lowStock: false },
  { id: 8, name: "Diclofenac 50mg", price: 130, stock: 3, category: "Analgésicos", expiry: "2026-07", lowStock: true },
];

export default function ProductsPage() {
  const [search, setSearch] = useState("");

  const filtered = mockProducts.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Producto</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Categoría</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Precio</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((product) => (
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
                  <span className={`inline-flex items-center gap-1 font-medium ${product.lowStock ? "text-red-600" : "text-slate-700"}`}>
                    {product.lowStock && <AlertTriangle className="w-3.5 h-3.5" />}
                    {product.stock}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right text-slate-500">{product.expiry || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
