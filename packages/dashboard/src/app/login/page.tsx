"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Pill, Eye, EyeOff } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#0ea5e9");
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.logoUrl) setLogoUrl(parsed.logoUrl);
        if (parsed.primaryColor) setPrimaryColor(parsed.primaryColor);
      } catch { /* ignore */ }
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError("Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  }

  function handleDevLogin() {
    localStorage.setItem("token", "dev-token");
    localStorage.setItem(
      "dev-user",
      JSON.stringify({
        id: "1",
        name: "Admin Dev",
        email: "admin@farmacia.com",
        role: "admin",
        stores: [
          { id: "store_leo", name: "Farmacia Leo" },
          { id: "store_centro", name: "Farmacia Centro" },
        ],
      })
    );
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Logo"
              width={56}
              height={56}
              className="w-14 h-14 rounded-2xl object-cover mx-auto mb-4 shadow-lg"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
              style={{ backgroundColor: primaryColor, boxShadow: `0 10px 15px -3px ${primaryColor}40` }}
            >
              <Pill className="w-7 h-7 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-900">Neo Farmacia</h1>
          <p className="text-slate-500 text-sm mt-1">Panel de gestión</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@farmacia.com"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus-primary transition-colors pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-primary hover:bg-primary-dark"
            style={{ backgroundColor: primaryColor }}
          >
            {loading ? "Entrando..." : "Iniciar sesión"}
          </button>
        </form>

        {/* Dev shortcut */}
        {process.env.NODE_ENV === "development" && (
          <button
            onClick={handleDevLogin}
            className="w-full mt-3 py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            [Dev] Entrar sin autenticación
          </button>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
