"use client";

import { Menu, ChevronDown, Store } from "lucide-react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user } = useAuth();
  const { currentStore, stores, selectStore } = useStore();
  const { theme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Store selector */}
        {stores.length > 1 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 text-sm font-medium text-slate-700 transition-colors"
            >
              <Store className="w-4 h-4 text-slate-400" />
              {currentStore?.name || "Seleccionar tienda"}
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50">
                {stores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => {
                      selectStore(store);
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    style={store.id === currentStore?.id ? { color: "var(--primary)", fontWeight: 500 } : { color: "#334155" }}
                  >
                    {store.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-700">{user?.name}</p>
          <p className="text-xs text-slate-400">{currentStore?.name}</p>
        </div>
        <div
          className="w-9 h-9 rounded-full bg-primary-light text-primary flex items-center justify-center text-sm font-semibold overflow-hidden"
        >
          {theme.logoUrl ? (
            <Image src={theme.logoUrl} alt="" width={36} height={36} className="w-full h-full object-cover" />
          ) : (
            user?.name?.charAt(0)?.toUpperCase() || "U"
          )}
        </div>
      </div>
    </header>
  );
}
