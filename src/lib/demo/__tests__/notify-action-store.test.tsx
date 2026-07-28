// Appointment client emails are opt-in (reschedule 2026-07-27; confirm/cancel 2026-07-28):
// every action mirrors with notifyClient:false, and the Notify dialog's Send button is a
// separate callable per action.
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
// A public booking still awaiting confirmation — the only status confirmAppointment accepts.
const PENDING: Appointment = {
  id: "a-live-2", ownerID: VOSS.user.id, type: "treatment", status: "awaitingConfirmation",
  dateISO: "2026-08-04", startMinute: 540, endMinute: 600,
  patientName: "Ben Ito",
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
  hydrate: vi.fn(async () => ({
    ...emptyState(),
    appointments: { [APPT.id]: APPT, [PENDING.id]: PENDING },
  })),
}));

const mirrorRescheduleAppointment = vi.hoisted(() => vi.fn(async () => {}));
const mirrorNotifyAppointmentRescheduled = vi.hoisted(() => vi.fn(async () => {}));
const mirrorNotifyAppointmentAction = vi.hoisted(() => vi.fn(async () => {}));
const mirrorConfirmAppointment = vi.hoisted(() => vi.fn(async () => {}));
const mirrorMarkAppointment = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/firebase/mirror", () => ({
  mirrorRescheduleAppointment, mirrorNotifyAppointmentRescheduled, mirrorNotifyAppointmentAction,
  mirrorConfirmAppointment, mirrorMarkAppointment,
}));

import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <DemoAuthProvider><DemoStoreProvider>{children}</DemoStoreProvider></DemoAuthProvider>;
}

async function readyStore() {
  const { result } = renderHook(() => useDemoStore(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  return result;
}

describe("appointment notification wiring (live)", () => {
  beforeEach(() => {
    mirrorRescheduleAppointment.mockClear();
    mirrorNotifyAppointmentRescheduled.mockClear();
    mirrorNotifyAppointmentAction.mockClear();
    mirrorConfirmAppointment.mockClear();
    mirrorMarkAppointment.mockClear();
  });

  it("reschedule mirrors with notifyClient:false and sends no email", async () => {
    const result = await readyStore();
    act(() => { result.current.rescheduleAppointment(APPT.id, "2026-08-03", 600, 60, VOSS); });
    await waitFor(() => expect(mirrorRescheduleAppointment).toHaveBeenCalledWith(APPT.id, "2026-08-03", 600, 60, false));
    expect(mirrorNotifyAppointmentRescheduled).not.toHaveBeenCalled();
  });

  it("confirm mirrors with notifyClient:false and sends no email", async () => {
    const result = await readyStore();
    act(() => { result.current.confirmAppointment(PENDING.id, VOSS); });
    await waitFor(() => expect(mirrorConfirmAppointment).toHaveBeenCalledWith(PENDING.id, false));
    expect(mirrorNotifyAppointmentAction).not.toHaveBeenCalled();
  });

  it("cancel mirrors with notifyClient:false and sends no email", async () => {
    const result = await readyStore();
    act(() => { result.current.markAppointment(APPT.id, "cancelled", VOSS); });
    await waitFor(() => expect(mirrorMarkAppointment).toHaveBeenCalledWith(APPT.id, "cancelled", false));
    expect(mirrorNotifyAppointmentAction).not.toHaveBeenCalled();
  });

  it("notifyAppointmentAction('rescheduled') routes to the dedicated reschedule callable", async () => {
    const result = await readyStore();
    act(() => { result.current.notifyAppointmentAction(APPT.id, "rescheduled"); });
    await waitFor(() => expect(mirrorNotifyAppointmentRescheduled).toHaveBeenCalledWith(APPT.id));
    expect(mirrorNotifyAppointmentAction).not.toHaveBeenCalled();
    expect(mirrorRescheduleAppointment).not.toHaveBeenCalled();
  });

  it("notifyAppointmentAction('confirmed') calls the action callable", async () => {
    const result = await readyStore();
    act(() => { result.current.notifyAppointmentAction(APPT.id, "confirmed"); });
    await waitFor(() => expect(mirrorNotifyAppointmentAction).toHaveBeenCalledWith(APPT.id, "confirmed"));
    expect(mirrorNotifyAppointmentRescheduled).not.toHaveBeenCalled();
  });

  it("notifyAppointmentAction('cancelled') calls the action callable", async () => {
    const result = await readyStore();
    act(() => { result.current.notifyAppointmentAction(APPT.id, "cancelled"); });
    await waitFor(() => expect(mirrorNotifyAppointmentAction).toHaveBeenCalledWith(APPT.id, "cancelled"));
  });
});
