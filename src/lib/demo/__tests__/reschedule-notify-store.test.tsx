// The calendar's reschedule email is opt-in (2026-07-27): a drag mirrors with
// notifyClient:false, and the Notify dialog's Send button is a separate callable.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { Appointment } from "@/lib/demo/types";

const VOSS = DEMO_ACCOUNTS[2].identities[0]; // Dr Elena Voss — owner id u-voss

const APPT: Appointment = {
  id: "a-live-1", ownerID: VOSS.user.id, type: "treatment", status: "confirmed",
  dateISO: "2026-08-03", startMinute: 540, endMinute: 600,
  patientName: "Anna Chen",
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

const mirrorRescheduleAppointment = vi.hoisted(() => vi.fn(async () => {}));
const mirrorNotifyAppointmentRescheduled = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/firebase/mirror", () => ({ mirrorRescheduleAppointment, mirrorNotifyAppointmentRescheduled }));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

describe("reschedule notification wiring (live)", () => {
  beforeEach(() => {
    mirrorRescheduleAppointment.mockClear();
    mirrorNotifyAppointmentRescheduled.mockClear();
  });

  it("reschedule mirrors with notifyClient:false and sends no email", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.rescheduleAppointment(APPT.id, "2026-08-03", 600, 60, VOSS); });
    await waitFor(() => expect(mirrorRescheduleAppointment).toHaveBeenCalledWith(APPT.id, "2026-08-03", 600, 60, false));
    expect(mirrorNotifyAppointmentRescheduled).not.toHaveBeenCalled();
  });

  it("notifyAppointmentRescheduled calls its own callable with the appointment id", async () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.notifyAppointmentRescheduled(APPT.id); });
    await waitFor(() => expect(mirrorNotifyAppointmentRescheduled).toHaveBeenCalledWith(APPT.id));
    expect(mirrorRescheduleAppointment).not.toHaveBeenCalled();
  });
});
