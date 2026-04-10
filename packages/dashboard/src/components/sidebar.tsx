"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ShoppingCart,
  MessageSquare,
  Package,
  Users,
  BarChart3,
  Smartphone,
  Settings,
  LogOut,
  X,
  Pill,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Pedidos", icon: ShoppingCart },
  { href: "/chats", label: "Chats", icon: MessageSquare },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/whatsapp", label: "WhatsApp", icon: Smartphone },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/settings", label: "Configuración", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

export function Sidebar({ open, collapsed, onClose, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { theme } = useTheme();

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          "fixed top-0 left-0 z-50 h-full bg-sidebar text-white flex flex-col transition-all duration-200",
          "lg:static lg:z-auto",
          collapsed ? "lg:w-[72px]" : "lg:w-[260px]",
          open ? "translate-x-0 w-[260px]" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar">
          <div className={clsx("flex items-center gap-2.5 overflow-hidden", collapsed && "lg:justify-center")}>
            {theme.logoUrl ? (
              <Image
                src={theme.logoUrl}
                alt="Logo"
                width={32}
                height={32}
                className="w-8 h-8 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Pill className="w-4 h-4 text-white" />
              </div>
            )}
            <span className={clsx(
              "font-semibold text-lg tracking-tight whitespace-nowrap transition-opacity duration-200",
              collapsed ? "lg:opacity-0 lg:w-0" : "opacity-100"
            )}>
              Neo Farmacia
            </span>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  collapsed && "lg:justify-center lg:px-0",
                  active
                    ? "bg-primary-alpha15 text-primary"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
                style={active ? { color: "var(--primary)" } : undefined}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className={clsx(
                  "whitespace-nowrap transition-opacity duration-200",
                  collapsed ? "lg:hidden" : "opacity-100"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden lg:block px-2 pb-1">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white w-full transition-colors"
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-5 h-5 shrink-0 mx-auto" />
            ) : (
              <>
                <PanelLeftClose className="w-5 h-5 shrink-0" />
                <span>Colapsar</span>
              </>
            )}
          </button>
        </div>

        {/* Logout */}
        <div className="px-2 pb-3 border-t border-white/10 pt-2">
          <button
            onClick={logout}
            title={collapsed ? "Cerrar sesión" : undefined}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white w-full transition-colors",
              collapsed && "lg:justify-center lg:px-0"
            )}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className={clsx(
              "whitespace-nowrap transition-opacity duration-200",
              collapsed ? "lg:hidden" : "opacity-100"
            )}>
              Cerrar sesión
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
