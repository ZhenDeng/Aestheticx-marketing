import type { ReactNode } from "react";
import { DemoStoreProvider } from "@/lib/demo/store";
import { AuthGuard } from "@/components/app/AuthGuard";
import { AppShell } from "@/components/app/AppShell";
import { ConsultCallProvider } from "@/components/app/ConsultCall";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DemoStoreProvider>
      <AuthGuard>
        <ConsultCallProvider>
          <AppShell>{children}</AppShell>
        </ConsultCallProvider>
      </AuthGuard>
    </DemoStoreProvider>
  );
}
