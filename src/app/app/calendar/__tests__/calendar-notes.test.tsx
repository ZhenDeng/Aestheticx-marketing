// Appointment notes on the calendar grid (spec: 2026-07-27). Drives the REAL CalendarPage
// against the demo seed; a harness books appointments of known durations through the live
// store so the height gate (NOTE_MIN_PX) can be exercised deterministically — the seeded
// appointments for this owner are all 30 minutes.
import { describe, it, expect, vi, beforeEach } from "vitest";
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

const LONG_NOTE = "Lip filler review";   // on a 60-min booking → inline
const SHORT_NOTE = "Brow consult";       // on a 15-min booking → tooltip only

function Providers({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

// Signs in, then books one 60-min and one 15-min appointment, both with notes. The guard is
// idempotent so StrictMode's double-invoked effect books each only once.
function Harness() {
  const { signIn, identity } = useDemoAuth();
  const store = useDemoStore();
  useEffect(() => {
    if (!identity) return;
    const existing = store.appointmentsForOwnerOnDay(identity.user.id, TODAY_ISO);
    // Voss's seeded treatment hours are 09:00–17:00 with a block at 15:30; 11:30 and 14:00
    // are free of both the block and the seeded appointments.
    if (!existing.some((a) => a.appointmentNote === LONG_NOTE)) {
      store.bookTreatmentAppointment({
        dateISO: TODAY_ISO, startMinute: 11 * 60 + 30, durationMinutes: 60,
        patientName: "Long Booking", patientID: "p-1", note: LONG_NOTE, identity,
      });
    }
    if (!existing.some((a) => a.appointmentNote === SHORT_NOTE)) {
      store.bookTreatmentAppointment({
        dateISO: TODAY_ISO, startMinute: 14 * 60, durationMinutes: 15,
        patientName: "Short Booking", patientID: "p-1", note: SHORT_NOTE, identity,
      });
    }
  }, [identity, store]);
  if (!identity) return <button onClick={() => signIn(voss)}>__signin__</button>;
  return <CalendarPage />;
}

async function signInAndOpen(view: "day" | "week" | "month") {
  const user = userEvent.setup();
  render(<Providers><Harness /></Providers>);
  await user.click(screen.getByRole("button", { name: "__signin__" }));
  await screen.findByRole("heading", { name: /^calendar$/i });
  await user.click(screen.getByRole("button", { name: new RegExp(`^${view}$`, "i") }));
  return user;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("appointment notes on the calendar grid", () => {
  it("day view: a 60-minute appointment shows its note inline on the chip", async () => {
    await signInAndOpen("day");
    expect(await screen.findByText(LONG_NOTE)).toBeInTheDocument();
  });

  it("week view: a 60-minute appointment shows its note inline on the chip", async () => {
    await signInAndOpen("week");
    expect(await screen.findByText(LONG_NOTE)).toBeInTheDocument();
  });

  it("a 15-minute chip keeps one line — the note is not rendered inline", async () => {
    await signInAndOpen("day");
    await screen.findByText(LONG_NOTE); // grid has settled
    expect(screen.queryByText(SHORT_NOTE)).not.toBeInTheDocument();
  });

  it("every chip carries its note in the tooltip and accessible name, regardless of height", async () => {
    await signInAndOpen("day");
    const short = await screen.findByRole("button", { name: new RegExp(SHORT_NOTE) });
    expect(short).toHaveAttribute("title", expect.stringContaining(SHORT_NOTE));

    const long = screen.getByRole("button", { name: new RegExp(LONG_NOTE) });
    expect(long).toHaveAttribute("title", expect.stringContaining(LONG_NOTE));
  });

  it("month view exposes the note through the chip tooltip", async () => {
    await signInAndOpen("month");
    // A month cell caps at MONTH_MAX_CHIPS (3), so assert against a seeded booking inside
    // the cap rather than the ones this harness appends late in the day.
    expect(await screen.findByTitle(/HA filler review/)).toBeInTheDocument();
  });

  it("suppresses the synthetic 'Auth request · …' note used to carry the booker's name", async () => {
    await signInAndOpen("day");
    await screen.findByText(LONG_NOTE);
    // Seeded auth slot appt-1 is booked by Lumière; its title already names the booker.
    expect(screen.queryByText(/^Auth request · /)).not.toBeInTheDocument();
    const titled = [...document.querySelectorAll("[title]")].map((el) => el.getAttribute("title") ?? "");
    expect(titled.some((t) => t.includes("Auth request · "))).toBe(false);
  });
});
