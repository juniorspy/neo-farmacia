"use client";

import { Smartphone, Wifi, WifiOff, QrCode, Plus } from "lucide-react";

interface WhatsAppNumber {
  id: string;
  number: string;
  name: string;
  status: "connected" | "disconnected" | "qr_pending";
  isDefault: boolean;
  messagesCount: number;
}

const mockNumbers: WhatsAppNumber[] = [
  { id: "1", number: "+1809-555-1000", name: "Farmacia Leo - Principal", status: "connected", isDefault: true, messagesCount: 1245 },
  { id: "2", number: "+1809-555-2000", name: "Farmacia Leo - Delivery", status: "disconnected", isDefault: false, messagesCount: 432 },
];

export default function WhatsAppPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">WhatsApp</h1>
          <p className="text-sm text-slate-500 mt-1">Números conectados via Evolution API</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Conectar número
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mockNumbers.map((num) => (
          <div key={num.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  num.status === "connected" ? "bg-emerald-50" : "bg-slate-100"
                }`}>
                  <Smartphone className={`w-5 h-5 ${
                    num.status === "connected" ? "text-emerald-600" : "text-slate-400"
                  }`} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{num.name}</p>
                  <p className="text-sm text-slate-500">{num.number}</p>
                </div>
              </div>
              {num.isDefault && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-light text-primary border border-primary font-medium">
                  Principal
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2">
                {num.status === "connected" ? (
                  <>
                    <Wifi className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-emerald-600 font-medium">Conectado</span>
                  </>
                ) : num.status === "qr_pending" ? (
                  <>
                    <QrCode className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-amber-600 font-medium">Escanear QR</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-500 font-medium">Desconectado</span>
                  </>
                )}
              </div>
              <span className="text-xs text-slate-400">{num.messagesCount.toLocaleString()} mensajes</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
