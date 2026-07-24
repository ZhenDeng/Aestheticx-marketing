// Calendar appointment check-out (spec: manual client invoicing, 2026-07-24). Drives the REAL
// CalendarPage against the demo seed through the real providers (calendar-page.test pattern):
// Voss opens his own-client appointment, checks out, and issues a client invoice — proving the
// composer wires through the real store end to end.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { DemoStoreProvider } from "@/lib/demo/store";
import CalendarPage from "@/app/app/calendar/page";

const voss = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — Doctor (independent)

function Providers({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}
function SignInAs({ children }: { children: ReactNode }) {
  const { signIn, identity } = useDemoAuth();
  return (
    <>
      {!identity && <button onClick={() => signIn(voss)}>__signin__</button>}
      {identity && children}
    </>
  );
}

describe("calendar appointment check-out (integration, demo seed)", () => {
  it("checks out an own-client appointment and issues a client invoice with PDF actions", async () => {
    const user = userEvent.setup();
    render(<Providers><SignInAs><CalendarPage /></SignInAs></Providers>);
    await user.click(screen.getByRole("button", { name: "__signin__" }));
    await screen.findByRole("heading", { name: /^calendar$/i });

    // Day view (today) shows Voss's own-client treatment appointment for Grace Huang (seed appt-6).
    await user.click(screen.getByRole("button", { name: /^day$/i }));
    await user.click(await screen.findByRole("button", { name: /Grace Huang/i }));

    const dialog = await screen.findByRole("dialog", { name: /appointment details/i });
    await user.click(within(dialog).getByRole("button", { name: /check out/i }));

    await user.type(within(dialog).getByLabelText("Line 1 description"), "Skin consult");
    await user.type(within(dialog).getByLabelText("Line 1 amount"), "180");
    await user.click(within(dialog).getByRole("button", { name: "Issue invoice" }));

    // Issuance succeeded end to end: the PDF hand-off actions appear.
    expect(within(dialog).getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
    expect(within(dialog).getByText(/invoice issued/i)).toBeInTheDocument();
  });
});
