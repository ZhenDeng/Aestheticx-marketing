import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import type { Appointment, DemoState, Identity } from "@/lib/demo/types";

// 16/07 feedback bug 3: doctors can close the loop from the dashboard — each upcoming
// authorisation call offers a doctor-only "Mark completed"; the row leaves the list
// because the shared appointment record flips to completed (same state the calendar uses).

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };

const NOON = Date.UTC(2026, 6, 20, 2, 0); // 2026-07-20, well before the slot below

function upcomingCall(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "ap-1",
    type: "authSlot",
    ownerID: "u-voss",
    bookedByID: "u-sarah",
    dateISO: "2026-07-21",
    startMinute: 540,
    endMinute: 550,
    status: "confirmed",
    patientID: undefined,
    patientName: "Amara Boyd",
    appointmentNote: "Auth request · Sarah Chen",
    ...over,
  };
}

let state: DemoState;
const markAppointment = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: voss, availableIdentities: [voss], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    state,
    now: NOON,
    status: "ready" as const,
    profileForUser: () => ({ ahpra: "", abn: "", phone: "", address: "", principalPlace: "", premises: [] }),
    pendingRequestsForDoctor: () => [],
    markAppointment,
    rehydrate: vi.fn(),
  }),
}));

import DashboardPage from "@/app/app/dashboard/page";

beforeEach(() => {
  markAppointment.mockReset();
  state = { ...emptyState(), appointments: { "ap-1": upcomingCall() } };
});

describe("Dashboard upcoming authorisation calls — mark completed (16/07 bug 3)", () => {
  it("offers Mark completed on each upcoming call row", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("button", { name: /mark completed/i })).toBeInTheDocument();
  });

  it("clicking it completes the appointment via the shared store", async () => {
    render(<DashboardPage />);
    await userEvent.click(screen.getByRole("button", { name: /mark completed/i }));
    expect(markAppointment).toHaveBeenCalledWith("ap-1", "completed", voss);
  });

  it("a cancelled call no longer renders a row at all (sync with calendar state)", () => {
    state = { ...emptyState(), appointments: { "ap-1": upcomingCall({ status: "cancelled" }) } };
    render(<DashboardPage />);
    expect(screen.queryByRole("button", { name: /mark completed/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no calls booked/i)).toBeInTheDocument();
  });
});
