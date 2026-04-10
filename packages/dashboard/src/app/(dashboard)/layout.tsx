"use client";

import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import { Shell } from "@/components/shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <StoreProvider>
        <ThemeProvider>
          <Shell>{children}</Shell>
        </ThemeProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
