import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import type { Appointment, Identity } from "@/lib/demo/types";

// PendingBookings is the patient-self-booking approval inbox (moved onto the calendar). It was
// at 0% coverage despite being a core clinical action surface: approve / reschedule / decline,
// each cross-date and each eagerly validated so a race lands an inline error. Uses the REAL
// backend helpers (appointmentTitle/appointmentContact) with a mocked store.

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

const pendingAppt: Appointment = {
  id: "appt-1",
  type: "consult",
  ownerID: "u-sarah",
  dateISO: "2026-07-20",
  startMinute: 9 * 60,
  endMinute: 9 * 60 + 30,
  status: "pending",
  lead: { givenName: "Amara", lastName: "Boyd", dob: "1990-05-02", phone: "0400 111 222", email: "amara@x.test" },
  appointmentNote: "Prefer morning if possible",
};

const confirmAppointment = vi.fn();
const markAppointment = vi.fn();
const rescheduleAppointment = vi.fn();
let pending: Appointment[];

function makeStore() {
  return {
    state: emptyState(),
    pendingBookings: vi.fn(() => pending),
    confirmAppointment,
    markAppointment,
    rescheduleAppointment,
  };
}
let store: ReturnType<typeof makeStore>;
vi.mock("@/lib/demo/store", () => ({ useDemoStore: () => store }));

import { PendingBookings } from "@/components/app/PendingBookings";

beforeEach(() => {
  pending = [pendingAppt];
  store = makeStore();
  confirmAppointment.mockReset();
  markAppointment.mockReset();
  rescheduleAppointment.mockReset();
});

describe("PendingBookings", () => {
  it("renders nothing when the inbox is empty", () => {
    pending = [];
    const { container } = render(<PendingBookings me={nurse} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("scopes the query to the acting subject (own uid for an independent nurse)", () => {
    render(<PendingBookings me={nurse} />);
    expect(store.pendingBookings).toHaveBeenCalledWith("u-sarah");
  });

  it("scopes to the clinic id when acting in a clinic context", () => {
    const clinicNurse: Identity = {
      user: { id: "u-sarah", name: "Sarah Chen" },
      role: "nurse",
      context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } },
    };
    render(<PendingBookings me={clinicNurse} />);
    expect(store.pendingBookings).toHaveBeenCalledWith("clinic-lumiere");
  });

  it("shows the booking title, time window, contact line and the patient's note", () => {
    render(<PendingBookings me={nurse} />);
    expect(screen.getByText(/Amara Boyd · new patient/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-20 · 09:00–09:30/)).toBeInTheDocument();
    expect(screen.getByText(/0400 111 222/)).toBeInTheDocument();
    expect(screen.getByText(/Prefer morning if possible/)).toBeInTheDocument();
  });

  it("approves via confirmAppointment", async () => {
    const user = userEvent.setup();
    render(<PendingBookings me={nurse} />);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(confirmAppointment).toHaveBeenCalledWith("appt-1", nurse);
  });

  it("declines via markAppointment(cancelled)", async () => {
    const user = userEvent.setup();
    render(<PendingBookings me={nurse} />);
    await user.click(screen.getByRole("button", { name: /decline/i }));
    expect(markAppointment).toHaveBeenCalledWith("appt-1", "cancelled", nurse);
  });

  it("reschedules with the edited date, time and duration", async () => {
    const user = userEvent.setup();
    render(<PendingBookings me={nurse} />);

    await user.click(screen.getByRole("button", { name: /reschedule/i }));
    const date = screen.getByLabelText(/new date/i);
    const time = screen.getByLabelText(/new time/i);
    await user.clear(date);
    await user.type(date, "2026-07-21");
    await user.clear(time);
    await user.type(time, "14:30");
    await user.selectOptions(screen.getByLabelText(/duration/i), "45");
    await user.click(screen.getByRole("button", { name: /apply/i }));

    // 14:30 → 870 minutes; duration 45.
    expect(rescheduleAppointment).toHaveBeenCalledWith("appt-1", "2026-07-21", 870, 45, nurse);
  });

  it("surfaces a race error inline when the action throws", async () => {
    confirmAppointment.mockImplementation(() => {
      throw new Error("gone");
    });
    const user = userEvent.setup();
    render(<PendingBookings me={nurse} />);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(await screen.findByText(/actioned elsewhere/i)).toBeInTheDocument();
  });

  it("explains an unavailable-slot reschedule with the treatment-hours message", async () => {
    const { BackendError } = await import("@/lib/demo/backend");
    rescheduleAppointment.mockImplementation(() => {
      throw new BackendError("unavailable");
    });
    const user = userEvent.setup();
    render(<PendingBookings me={nurse} />);
    await user.click(screen.getByRole("button", { name: /reschedule/i }));
    await user.click(screen.getByRole("button", { name: /apply/i }));
    expect(await screen.findByText(/outside your treatment hours/i)).toBeInTheDocument();
  });
});
