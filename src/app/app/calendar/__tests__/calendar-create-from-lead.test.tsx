// Reported 28/07: creating a patient file from a calendar lead left everything unlinked —
// the appointment detail asked to create the file AGAIN, and the new file showed no
// appointment history. The create and the link were two same-tick store calls; the link's
// eager validation ran against a stale closure and its throw was swallowed as best-effort.
// This drives the real flow end to end: open the lead appointment, create the file from
// the lead, and assert the appointment and the new patient actually know each other.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { isoDay } from "@/lib/demo/backend";
import { SEED_NOW } from "@/lib/demo/seed";

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => false }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
// The address field debounce-fetches suggestions; keep the test offline.
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import CalendarPage from "@/app/app/calendar/page";

const voss = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — owner id u-voss
const TODAY_ISO = isoDay(SEED_NOW);

function Providers({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

// Signs in, then seeds one lead treatment appointment on today. Idempotent under
// StrictMode's double-invoked effect.
function Harness() {
  const { signIn, identity } = useDemoAuth();
  const store = useDemoStore();
  useEffect(() => {
    if (!identity) return;
    const mine = store.appointmentsForOwnerOnDay(identity.user.id, TODAY_ISO);
    // Also match the post-link shape (lead cleared, patientName stamped) — the store
    // changes re-run this effect, and a lead-only check would book a duplicate.
    if (mine.some((a) => a.lead?.email === "jordan@example.com" || a.patientName === "Jordan Lee")) return;
    store.bookTreatmentAppointment({
      dateISO: TODAY_ISO, startMinute: 540, durationMinutes: 60,
      lead: { givenName: "Jordan", lastName: "Lee", dob: "1990-01-15", phone: "0400111222", email: "jordan@example.com" },
      identity,
    });
  }, [identity, store]);
  if (!identity) return <button onClick={() => signIn(voss)}>__signin__</button>;
  return <StoreProbe><CalendarPage /></StoreProbe>;
}

// Exposes the live store state to assertions without reaching into React internals.
const probe: { current: ReturnType<typeof useDemoStore> | null } = { current: null };
function StoreProbe({ children }: { children: ReactNode }) {
  const store = useDemoStore();
  // Assigned in an effect, not during render — the React compiler forbids render-time
  // writes to outer values, and the assertions only read it between interactions anyway.
  useEffect(() => { probe.current = store; });
  return <>{children}</>;
}

describe("calendar create-from-lead links the appointment to the new file", () => {
  it("creates the file, links it, and stops offering to create again", async () => {
    const user = userEvent.setup();
    render(<Providers><Harness /></Providers>);
    await user.click(screen.getByRole("button", { name: "__signin__" }));
    await screen.findByRole("heading", { name: /^calendar$/i });
    await user.click(screen.getByRole("button", { name: /^day$/i }));

    // Open the lead appointment and start the create-from-lead form.
    await user.click(await screen.findByRole("button", { name: /09:00.*Jordan Lee/i }));
    const detail = await screen.findByRole("dialog", { name: /appointment details/i });
    await user.click(within(detail).getByRole("button", { name: /create patient from lead/i }));

    // draftFromLead prefills names/DOB/phone/email; complete the rest.
    await user.selectOptions(within(detail).getByLabelText(/gender/i), "Male");
    await user.type(within(detail).getByLabelText(/address/i), "1 Test St");
    await user.type(within(detail).getByLabelText(/allergies/i), "None");
    await user.type(within(detail).getByLabelText(/current medications/i), "None");
    await user.click(within(detail).getByRole("button", { name: /create patient/i }));

    // The store now holds the link: appointment → patient and patient → appointment.
    await waitFor(() => {
      const appt = Object.values(probe.current!.state.appointments).find((a) => a.patientName === "Jordan Lee" && a.dateISO === TODAY_ISO);
      expect(appt?.patientID).toBeTruthy();
      expect(appt?.lead).toBeUndefined();
      expect(probe.current!.appointmentsForPatient(appt!.patientID!).map((a) => a.id)).toContain(appt!.id);
    });
    // And the form navigated to the new file (the reported flow's next stop).
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/app\/patients\//));

    // The router is mocked, so the detail panel is still open — close it, then re-open
    // the appointment: it must offer no second "create file".
    await user.click(within(detail).getByRole("button", { name: /^close$/i }));
    await user.click(await screen.findByRole("button", { name: /09:00.*Jordan Lee/i }));
    const reopened = await screen.findByRole("dialog", { name: /appointment details/i });
    expect(within(reopened).queryByRole("button", { name: /create patient from lead/i })).not.toBeInTheDocument();
  });
});
