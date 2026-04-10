"use client";

import { useState } from "react";
import { Search, Users, ShoppingCart, MessageSquare } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  lastOrder: string;
  registered: boolean;
}

const mockCustomers: Customer[] = [
  { id: "1", name: "María López", phone: "+1809-555-0101", totalOrders: 12, totalSpent: 8500, lastOrder: "Hoy", registered: true },
  { id: "2", name: "José García", phone: "+1809-555-0102", totalOrders: 8, totalSpent: 5200, lastOrder: "Ayer", registered: true },
  { id: "3", name: "Ana Reyes", phone: "+1809-555-0103", totalOrders: 23, totalSpent: 15800, lastOrder: "Hoy", registered: true },
  { id: "4", name: "Carlos Marte", phone: "+1809-555-0104", totalOrders: 3, totalSpent: 1250, lastOrder: "Hace 3 días", registered: false },
  { id: "5", name: "Laura Sánchez", phone: "+1809-555-0105", totalOrders: 6, totalSpent: 3400, lastOrder: "Hace 1 semana", registered: true },
];

export default function CustomersPage() {
  const [search, setSearch] = useState("");

  const filtered = mockCustomers.filter(
    (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
        <p className="text-sm text-slate-500 mt-1">Clientes que han interactuado por WhatsApp</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((customer) => (
          <div key={customer.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary-light text-primary flex items-center justify-center text-sm font-bold">
                  {customer.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{customer.name}</p>
                  <p className="text-xs text-slate-400">{customer.phone}</p>
                </div>
              </div>
              {customer.registered && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium">
                  Registrado
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">{customer.totalOrders}</p>
                <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                  <ShoppingCart className="w-3 h-3" /> Pedidos
                </p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">RD${(customer.totalSpent / 1000).toFixed(1)}k</p>
                <p className="text-[11px] text-slate-400">Gastado</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-slate-700 mt-1">{customer.lastOrder}</p>
                <p className="text-[11px] text-slate-400">Último pedido</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
