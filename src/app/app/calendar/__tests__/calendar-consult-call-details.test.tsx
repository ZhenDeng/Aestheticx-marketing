// Consult-call details in the calendar's appointment modal (owner feedback 27/07: a booked
// call is too short to read on the grid, and the modal said nothing about it either). Drives
// the REAL CalendarPage against the demo seed through the real providers, from both sides of
// the call: the doctor who owns the slot and the clinic that booked it.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { Identity } from "@/lib/demo/types";

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { DemoStoreProvider } from "@/lib/demo/store";
import CalendarPage from "@/app/app/calendar/page";

const voss = DEMO_ACCOUNTS[2].identities[0];       // Dr Elena Voss — owns the seed teleconsult
const sarahClinic = DEMO_ACCOUNTS[0].identities[1]; // Sarah Chen at Lumière — booked it

function Providers({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}
function SignInAs({ who, children }: { who: Identity; children: ReactNode }) {
  const { signIn, identity } = useDemoAuth();
  return (
    <>
      {!identity && <button onClick={() => signIn(who)}>__signin__</button>}
      {identity && children}
    </>
  );
}

// Seed appt-1: an authorisation teleconsult on Voss's calendar, booked by Lumière for Mara Boyd.
async function openTheCall(who: Identity) {
  const user = userEvent.setup();
  render(<Providers><SignInAs who={who}><CalendarPage /></SignInAs></Providers>);
  await user.click(screen.getByRole("button", { name: "__signin__" }));
  await screen.findByRole("heading", { name: /^calendar$/i });
  await user.click(screen.getByRole("button", { name: /^day$/i }));
  await user.click(await screen.findByRole("button", { name: /Mara Boyd.*teleconsult/i }));
  return screen.findByRole("dialog", { name: /appointment details/i });
}

describe("consult-call details in the appointment modal", () => {
  it("tells the doctor it is a teleconsult and who requested it", async () => {
    const dialog = await openTheCall(voss);
    expect(within(dialog).getByText(/authorisation teleconsult/i)).toBeInTheDocument();
    expect(within(dialog).getByText("Requested by")).toBeInTheDocument();
    expect(within(dialog).getByText("Lumière Clinic")).toBeInTheDocument();
    // The doctor is the owner — naming them back to themselves would be noise.
    expect(within(dialog).queryByText("Call with")).not.toBeInTheDocument();
  });

  it("names the prescriber on the booking side's calendar", async () => {
    const dialog = await openTheCall(sarahClinic);
    expect(within(dialog).getByText("Call with")).toBeInTheDocument();
    expect(within(dialog).getByText("Dr Elena Voss")).toBeInTheDocument();
  });
});
