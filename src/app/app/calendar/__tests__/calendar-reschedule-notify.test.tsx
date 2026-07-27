// End-to-end over the REAL CalendarPage and demo seed (2026-07-27): a reschedule commits
// and then asks whether to email the client, instead of the backend emailing automatically.
// Pointer-drag simulation is unreliable in jsdom (no layout, no pointer capture), so this
// drives the detail panel's Reschedule button — the same store call and the same prompt.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

const voss = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — owner id u-voss
const TODAY_ISO = isoDay(SEED_NOW);

function Providers({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

// Signs in, then seeds one treatment appointment with a client email on today's date.
// Idempotent so StrictMode's double-invoked effect books only one.
function Harness() {
  const { signIn, identity } = useDemoAuth();
  const store = useDemoStore();
  useEffect(() => {
    if (!identity) return;
    const mine = store.appointmentsForOwnerOnDay(identity.user.id, TODAY_ISO);
    if (mine.some((a) => a.lead?.email === "anna@example.com")) return;
    // BookTreatmentInput carries no ownerID — the owner is derived from `identity`.
    store.bookTreatmentAppointment({
      dateISO: TODAY_ISO, startMinute: 540, durationMinutes: 60,
      lead: { givenName: "Anna", lastName: "Chen", email: "anna@example.com" },
      identity,
    });
  }, [identity, store]);
  if (!identity) return <button onClick={() => signIn(voss)}>__signin__</button>;
  return <CalendarPage />;
}

async function openSeededAppointment(user: ReturnType<typeof userEvent.setup>) {
  render(<Providers><Harness /></Providers>);
  await user.click(screen.getByRole("button", { name: "__signin__" }));
  await screen.findByRole("heading", { name: /^calendar$/i });
  await user.click(screen.getByRole("button", { name: /^day$/i }));
  await user.click(await screen.findByRole("button", { name: /09:00.*Anna Chen/i }));
  return screen.findByRole("dialog", { name: /appointment details/i });
}

describe("calendar reschedule asks before emailing the client", () => {
  it("moving an appointment raises the Notify dialog naming the new time", async () => {
    const user = userEvent.setup();
    const detail = await openSeededAppointment(user);
    const timeInput = within(detail).getByDisplayValue("09:00");
    await user.clear(timeInput);
    await user.type(timeInput, "10:30");
    await user.click(within(detail).getByRole("button", { name: /^reschedule$/i }));

    const notify = await screen.findByRole("dialog", { name: /notify the client/i });
    expect(notify).toHaveTextContent("Anna Chen");
    expect(notify).toHaveTextContent("10:30");
    expect(within(notify).getByRole("button", { name: /send email/i })).toBeInTheDocument();
  });

  it("Don't send closes the dialog and leaves the move in place", async () => {
    const user = userEvent.setup();
    const detail = await openSeededAppointment(user);
    const timeInput = within(detail).getByDisplayValue("09:00");
    await user.clear(timeInput);
    await user.type(timeInput, "10:30");
    await user.click(within(detail).getByRole("button", { name: /^reschedule$/i }));

    await user.click(await screen.findByRole("button", { name: /don't send/i }));
    expect(screen.queryByRole("dialog", { name: /notify the client/i })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /10:30.*Anna Chen/i })).toBeInTheDocument();
  });
});
