// Availability treatment blocks render on the calendar (spec: 2026-07-24). Drives the REAL
// CalendarPage against the demo seed; a helper adds a treatment block through the live store
// (same provider context), then the day view is asserted to show the "Blocked" band.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { isoDay } from "@/lib/demo/backend";
import { SEED_NOW } from "@/lib/demo/seed";

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import CalendarPage from "@/app/app/calendar/page";

const voss = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — Doctor (independent), owner id u-voss
const TODAY_ISO = isoDay(SEED_NOW);

function Providers({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

// Signs in, then adds a treatment block for the signed-in owner on today's date. The guard is
// idempotent (block already present → skip) so StrictMode's double-invoked effect adds only one.
function Harness() {
  const { signIn, identity } = useDemoAuth();
  const store = useDemoStore();
  useEffect(() => {
    if (identity && store.treatmentBlocksForOwnerOnDay(identity.user.id, TODAY_ISO).length === 0) {
      store.addTreatmentBlock(identity.user.id, { dateISO: TODAY_ISO, startMinute: 600, endMinute: 660 });
    }
  }, [identity, store]);
  if (!identity) return <button onClick={() => signIn(voss)}>__signin__</button>;
  return <CalendarPage />;
}

describe("calendar renders Availability treatment blocks (integration, demo seed)", () => {
  it("shows a Blocked band on the day the block was added", async () => {
    const user = userEvent.setup();
    render(<Providers><Harness /></Providers>);
    await user.click(screen.getByRole("button", { name: "__signin__" }));
    await screen.findByRole("heading", { name: /^calendar$/i });
    await user.click(screen.getByRole("button", { name: /^day$/i }));
    expect(await screen.findByText("Blocked")).toBeInTheDocument();
  });
});
