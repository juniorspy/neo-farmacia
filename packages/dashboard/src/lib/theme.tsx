"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface ThemeConfig {
  primaryColor: string;
  logoUrl: string | null;
}

const defaultTheme: ThemeConfig = {
  primaryColor: "#0ea5e9", // sky-500
  logoUrl: null,
};

// Preset colors for the picker
export const themePresets = [
  { name: "Azul cielo", value: "#0ea5e9" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Índigo", value: "#6366f1" },
  { name: "Violeta", value: "#8b5cf6" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Rojo", value: "#ef4444" },
  { name: "Naranja", value: "#f97316" },
  { name: "Ámbar", value: "#f59e0b" },
  { name: "Verde", value: "#22c55e" },
  { name: "Esmeralda", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cian", value: "#06b6d4" },
];

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function applyThemeToDOM(config: ThemeConfig) {
  const root = document.documentElement;
  const { h, s, l } = hexToHsl(config.primaryColor);

  root.style.setProperty("--primary", config.primaryColor);
  root.style.setProperty("--primary-h", String(h));
  root.style.setProperty("--primary-s", `${s}%`);
  root.style.setProperty("--primary-l", `${l}%`);
  // Darker variant for hover
  root.style.setProperty("--primary-dark", `hsl(${h}, ${s}%, ${Math.max(l - 10, 10)}%)`);
  // Lighter variants
  root.style.setProperty("--primary-light", `hsl(${h}, ${s}%, 95%)`);
  root.style.setProperty("--primary-muted", `hsl(${h}, ${s}%, 90%)`);
  // Sidebar bg: very dark version of the primary
  root.style.setProperty("--sidebar-bg", `hsl(${h}, ${Math.min(s + 20, 100)}%, 12%)`);
  root.style.setProperty("--sidebar-border", `hsl(${h}, ${Math.min(s + 10, 100)}%, 18%)`);
  // Active nav item
  root.style.setProperty("--primary-alpha15", `hsla(${h}, ${s}%, ${l}%, 0.15)`);
}

interface ThemeContextType {
  theme: ThemeConfig;
  setTheme: (config: Partial<ThemeConfig>) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeConfig>(defaultTheme);

  // Load saved theme
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ThemeConfig;
        setThemeState(parsed);
        applyThemeToDOM(parsed);
      } catch {
        applyThemeToDOM(defaultTheme);
      }
    } else {
      applyThemeToDOM(defaultTheme);
    }
  }, []);

  const setTheme = useCallback((partial: Partial<ThemeConfig>) => {
    setThemeState((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem("theme", JSON.stringify(next));
      applyThemeToDOM(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
