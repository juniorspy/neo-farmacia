"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Store,
  Copy,
  Check,
  ExternalLink,
  Download,
  Share2,
  Loader2,
} from "lucide-react";
import { useStore } from "@/lib/store";

export default function MyStorePage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.id;
  const storeName = currentStore?.name || "tu farmacia";

  const [storeUrl, setStoreUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Build the public URL client-side — the storefront is served by this same
  // app at /store/:storeId, so its origin is our own.
  useEffect(() => {
    if (storeId) setStoreUrl(`${window.location.origin}/store/${storeId}`);
  }, [storeId]);

  async function copyLink() {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function downloadQR() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `tienda-${storeId}-qr.png`;
    a.click();
  }

  async function share() {
    if (!storeUrl) return;
    if (navigator.share) {
      await navigator
        .share({ title: `Tienda de ${storeName}`, url: storeUrl })
        .catch(() => {});
    } else {
      copyLink();
    }
  }

  if (!storeId) {
    return (
      <div className="p-6 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Cargando…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Store className="w-6 h-6" />
          Mi Tienda online
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tu farmacia tiene una tienda web con tu catálogo y precios. Comparte el
          enlace o pega el código QR en el mostrador — tus clientes piden online y
          el pedido te llega al panel.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* QR card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center text-center">
          <div className="p-3 bg-white rounded-xl border border-slate-100">
            <QRCodeCanvas
              ref={canvasRef}
              value={storeUrl || " "}
              size={200}
              level="M"
              marginSize={2}
            />
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Escanea con la cámara para abrir la tienda
          </p>
          <button
            onClick={downloadQR}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
          >
            <Download className="w-4 h-4" />
            Descargar QR para imprimir
          </button>
        </div>

        {/* Link + actions card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col">
          <div className="text-sm font-medium text-slate-700 mb-2">
            Enlace de tu tienda
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span className="flex-1 text-sm text-slate-700 font-mono truncate" title={storeUrl}>
              {storeUrl || "…"}
            </span>
            <button
              onClick={copyLink}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 shrink-0"
              title="Copiar"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <a
              href={storeUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir mi tienda
            </a>
            <button
              onClick={share}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              <Share2 className="w-4 h-4" />
              Compartir enlace
            </button>
          </div>

          <div className="mt-auto pt-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800">
              Los pedidos de la tienda llegan a <span className="font-medium">Pedidos</span>{" "}
              igual que los de WhatsApp. El cliente paga al recibir o en la farmacia.
            </div>
          </div>
        </div>
      </div>

      {/* How to use */}
      <div className="mt-5 bg-white rounded-xl border border-slate-200 p-5">
        <div className="text-sm font-medium text-slate-700 mb-3">Cómo usarla</div>
        <ol className="space-y-2.5 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
            Comparte el enlace por WhatsApp, redes o ponlo en tu perfil.
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
            Descarga el QR e imprímelo para pegarlo en el mostrador o en tus deliveries.
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
            El cliente arma su pedido y lo envía; te llega a <span className="font-medium">Pedidos</span> para despacharlo.
          </li>
        </ol>
      </div>
    </div>
  );
}
