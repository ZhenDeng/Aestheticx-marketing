import type { ReactNode } from "react";
import { DemoStoreProvider } from "@/lib/demo/store";
import { AuthGuard } from "@/components/app/AuthGuard";
import { AppShell } from "@/components/app/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DemoStoreProvider>
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </DemoStoreProvider>
  );
}
