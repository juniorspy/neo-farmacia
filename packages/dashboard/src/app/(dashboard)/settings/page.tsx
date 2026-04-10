"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Save, Upload, X, Check, Palette, Pill } from "lucide-react";
import { useTheme, themePresets } from "@/lib/theme";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [customColor, setCustomColor] = useState(theme.primaryColor);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleColorSelect(color: string) {
    setCustomColor(color);
    setTheme({ primaryColor: color });
  }

  function handleCustomColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const color = e.target.value;
    setCustomColor(color);
    setTheme({ primaryColor: color });
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("El logo debe ser menor a 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setTheme({ logoUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setTheme({ logoUrl: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500 mt-1">Ajustes de la tienda y agente</p>
      </div>

      {/* Apariencia */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-slate-700" />
          <h2 className="font-semibold text-slate-900">Apariencia</h2>
        </div>

        {/* Color del tema */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Color del tema
          </label>
          <div className="grid grid-cols-6 gap-2.5">
            {themePresets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handleColorSelect(preset.value)}
                title={preset.name}
                className="group relative w-full aspect-square rounded-xl transition-transform hover:scale-110"
                style={{ backgroundColor: preset.value }}
              >
                {theme.primaryColor === preset.value && (
                  <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />
                )}
              </button>
            ))}
          </div>

          {/* Custom color */}
          <div className="flex items-center gap-3 mt-4">
            <label className="text-sm text-slate-500">Color personalizado:</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customColor}
                onChange={handleCustomColorChange}
                className="w-9 h-9 rounded-lg cursor-pointer border border-slate-200 p-0.5"
              />
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                    setCustomColor(val);
                    if (val.length === 7) setTheme({ primaryColor: val });
                  }
                }}
                className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-mono focus-primary"
                placeholder="#0ea5e9"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-400 mb-3">Vista previa</p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
                style={{ backgroundColor: "var(--primary)" }}
              >
                Botón primario
              </button>
              <button
                className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
                style={{ color: "var(--primary)", borderColor: "var(--primary)" }}
              >
                Botón outline
              </button>
              <span
                className="text-sm font-medium px-3 py-1 rounded-full"
                style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}
              >
                Badge
              </span>
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "var(--sidebar-bg)" }}
              >
                <Pill className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="pt-2">
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Logo de la tienda
          </label>

          <div className="flex items-start gap-4">
            {/* Current logo preview */}
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
              {theme.logoUrl ? (
                <Image
                  src={theme.logoUrl}
                  alt="Logo"
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--primary-light)" }}
                >
                  <Pill className="w-8 h-8" style={{ color: "var(--primary)" }} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Subir logo
              </button>
              {theme.logoUrl && (
                <button
                  onClick={removeLogo}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 text-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Quitar logo
                </button>
              )}
              <p className="text-xs text-slate-400">PNG, JPG o SVG. Máximo 2MB.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Store info */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Información de la tienda</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
            <input
              type="text"
              defaultValue="Farmacia Leo"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
            <input
              type="text"
              defaultValue="+1809-555-1000"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
            <input
              type="text"
              defaultValue="Calle Principal #45, Santo Domingo"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary"
            />
          </div>
        </div>
      </div>

      {/* Agent config */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Configuración del agente</h2>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensaje de bienvenida</label>
          <textarea
            rows={3}
            defaultValue="¡Hola! Bienvenido a Farmacia Leo. ¿En qué puedo ayudarte hoy?"
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary resize-none"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Respuesta automática</p>
            <p className="text-xs text-slate-400">El bot responde automáticamente a nuevos mensajes</p>
          </div>
          <div className="w-11 h-6 bg-primary rounded-full p-0.5 cursor-pointer">
            <div className="w-5 h-5 bg-white rounded-full shadow-sm transform translate-x-5 transition-transform" />
          </div>
        </div>
      </div>

      <button
        className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Save className="w-4 h-4" />
        Guardar cambios
      </button>
    </div>
  );
}
