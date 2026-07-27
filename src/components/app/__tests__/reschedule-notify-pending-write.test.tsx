// C2 (27/07 review): notifyAppointmentRescheduled re-reads the appointment SERVER-SIDE, so a
// Send click that lands before the reschedule mirror commits would email the pre-move time —
// and if the mirror then fails, the store reverts the move but an already-sent Send would have
// emailed a move that never happened. This exercises the REAL store's pendingWrites signal
// (not a mocked store) end-to-end in live mode, because the bug is specifically about the
// ordering of two async writes, which a mocked store can't reproduce.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { Appointment } from "@/lib/demo/types";

const VOSS = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — owner id u-voss

const APPT: Appointment = {
  id: "a-live-1", ownerID: VOSS.user.id, type: "treatment", status: "confirmed",
  dateISO: "2026-08-03", startMinute: 540, endMinute: 600,
  lead: { givenName: "Anna", lastName: "Chen", email: "anna@example.com" },
};

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true }));
vi.mock("@/lib/firebase/auth", () => ({
  watchUser: (cb: (u: unknown) => void) => { cb({ uid: VOSS.user.id }); return () => {}; },
  identitiesForUser: async () => [VOSS],
  mustChangePasswordForUser: async () => false,
  currentUserUid: () => VOSS.user.id,
  watchClaimsRevision: () => () => {},
}));
vi.mock("@/lib/firebase/hydrate", () => ({
  hydrate: vi.fn(async () => ({ ...emptyState(), appointments: { [APPT.id]: APPT } })),
}));

// A deferred mirrorRescheduleAppointment holds the write open so the test can observe the
// disabled window, then resolves it to observe re-enable. Fake timers wouldn't help — the
// race is about promise ordering (cold-start latency), not elapsed time.
let resolveMirror: () => void;
const mirrorRescheduleAppointment = vi.hoisted(() => vi.fn());
const mirrorNotifyAppointmentRescheduled = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/firebase/mirror", () => ({ mirrorRescheduleAppointment, mirrorNotifyAppointmentRescheduled }));

import { DemoAuthProvider } from "@/lib/demo/auth";
import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { RescheduleNotifyProvider, useRescheduleNotify } from "@/components/app/RescheduleNotify";

// Stands in for a drag commit: reschedules, then raises the prompt in the same handler,
// exactly like the calendar's eight wired sites and PendingBookings' ninth.
function Trigger() {
  const store = useDemoStore();
  const prompt = useRescheduleNotify();
  if (store.status !== "ready") return null;
  return (
    <button onClick={() => {
      store.rescheduleAppointment(APPT.id, APPT.dateISO, 600, 60, VOSS);
      prompt(APPT.id);
    }}>
      __move__
    </button>
  );
}

function Harness({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoStoreProvider><RescheduleNotifyProvider>{children}</RescheduleNotifyProvider></DemoStoreProvider>
    </DemoAuthProvider>
  );
}

describe("RescheduleNotify dialog — Send while the reschedule write is in flight", () => {
  beforeEach(() => {
    mirrorRescheduleAppointment.mockReset();
    mirrorNotifyAppointmentRescheduled.mockClear();
    mirrorRescheduleAppointment.mockImplementation(
      () => new Promise<void>((resolve) => { resolveMirror = resolve; }),
    );
  });

  it("disables Send until the mirror settles, then enables it", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger /></Harness>);
    await user.click(await screen.findByRole("button", { name: "__move__" }));

    const dialog = await screen.findByRole("dialog", { name: /notify the client/i });
    const send = screen.getByRole("button", { name: /send email/i });
    expect(send).toBeDisabled();
    expect(dialog).toHaveTextContent(/saving the new time/i);

    resolveMirror();
    await waitFor(() => expect(send).toBeEnabled());
    expect(dialog).not.toHaveTextContent(/saving the new time/i);
  });

  it("keeps Don't send enabled and working throughout the pending write", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger /></Harness>);
    await user.click(await screen.findByRole("button", { name: "__move__" }));
    await screen.findByRole("dialog", { name: /notify the client/i });

    const dontSend = screen.getByRole("button", { name: /don't send/i });
    expect(dontSend).toBeEnabled();
    await user.click(dontSend);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mirrorNotifyAppointmentRescheduled).not.toHaveBeenCalled();

    // Let the pending write settle so it doesn't leak into the next test; wrapped in act
    // because settling it flips pendingWrites, a React state update.
    await act(async () => { resolveMirror(); await Promise.resolve(); });
  });
});
