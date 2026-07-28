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
  // A patient self-booking lands as a `treatment` appointment awaiting confirmation — these were
  // "consult"/"pending", neither of which exists in AppointmentType/AppointmentStatus. vitest
  // strips types, so the invalid fixture ran anyway and only `tsc --noEmit` ever complained.
  type: "treatment",
  ownerID: "u-sarah",
  dateISO: "2026-07-20",
  startMinute: 9 * 60,
  endMinute: 9 * 60 + 30,
  status: "awaitingConfirmation",
  lead: { givenName: "Amara", lastName: "Boyd", dob: "1990-05-02", phone: "0400 111 222", email: "amara@x.test" },
  appointmentNote: "Prefer morning if possible",
};

const confirmAppointment = vi.fn();
const markAppointment = vi.fn();
const rescheduleAppointment = vi.fn();
const notifyAppointmentAction = vi.fn();
let pending: Appointment[];

function makeStore() {
  return {
    // appointments carries pendingAppt regardless of the `pending` inbox list above — the
    // NotifyClient dialog (C1) reads the appointment straight from store.state, not from
    // the inbox, so it needs a hit here to render anything once an action raises it.
    state: { ...emptyState(), appointments: { [pendingAppt.id]: pendingAppt } },
    refreshing: false,
    pendingBookings: vi.fn(() => pending),
    confirmAppointment,
    markAppointment,
    rescheduleAppointment,
    notifyAppointmentAction,
  };
}
let store: ReturnType<typeof makeStore>;
vi.mock("@/lib/demo/store", () => ({ useDemoStore: () => store }));

import { PendingBookings } from "@/components/app/PendingBookings";
import { NotifyClientProvider } from "@/components/app/NotifyClient";

// PendingRow raises the same Notify-the-client dialog as the calendar's drag/resize handlers
// (reschedule: C1, 27/07 review; approve/decline: 28/07 sweep) — useNotifyClient() throws
// outside its provider, so every render needs one, not just the dialog tests below.
function renderInbox(me: Identity) {
  return render(<NotifyClientProvider><PendingBookings me={me} /></NotifyClientProvider>);
}

beforeEach(() => {
  pending = [pendingAppt];
  store = makeStore();
  confirmAppointment.mockReset();
  markAppointment.mockReset();
  rescheduleAppointment.mockReset();
  notifyAppointmentAction.mockReset();
});

describe("PendingBookings", () => {
  it("renders nothing when the inbox is empty", () => {
    pending = [];
    const { container } = renderInbox(nurse);
    expect(container).toBeEmptyDOMElement();
  });

  it("scopes the query to the acting subject (own uid for an independent nurse)", () => {
    renderInbox(nurse);
    expect(store.pendingBookings).toHaveBeenCalledWith("u-sarah");
  });

  it("scopes to the clinic id when acting in a clinic context", () => {
    const clinicNurse: Identity = {
      user: { id: "u-sarah", name: "Sarah Chen" },
      role: "nurse",
      context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } },
    };
    renderInbox(clinicNurse);
    expect(store.pendingBookings).toHaveBeenCalledWith("clinic-lumiere");
  });

  it("shows the booking title, time window, contact line and the patient's note", () => {
    renderInbox(nurse);
    expect(screen.getByText(/Amara Boyd · new patient/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-20 · 09:00–09:30/)).toBeInTheDocument();
    expect(screen.getByText(/0400 111 222/)).toBeInTheDocument();
    expect(screen.getByText(/Prefer morning if possible/)).toBeInTheDocument();
  });

  it("approves via confirmAppointment", async () => {
    const user = userEvent.setup();
    renderInbox(nurse);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(confirmAppointment).toHaveBeenCalledWith("appt-1", nurse);
  });

  it("declines via markAppointment(cancelled)", async () => {
    const user = userEvent.setup();
    renderInbox(nurse);
    await user.click(screen.getByRole("button", { name: /decline/i }));
    expect(markAppointment).toHaveBeenCalledWith("appt-1", "cancelled", nurse);
  });

  it("reschedules with the edited date, time and duration", async () => {
    const user = userEvent.setup();
    renderInbox(nurse);

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
    renderInbox(nurse);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(await screen.findByText(/actioned elsewhere/i)).toBeInTheDocument();
  });

  it("explains an unavailable-slot reschedule with the treatment-hours message", async () => {
    const { BackendError } = await import("@/lib/demo/backend");
    rescheduleAppointment.mockImplementation(() => {
      throw new BackendError("unavailable");
    });
    const user = userEvent.setup();
    renderInbox(nurse);
    await user.click(screen.getByRole("button", { name: /reschedule/i }));
    await user.click(screen.getByRole("button", { name: /apply/i }));
    expect(await screen.findByText(/outside your treatment hours/i)).toBeInTheDocument();
  });

  // C1 (27/07 review): this was the ninth reschedule site — the calendar's eight drag/resize
  // handlers all raised this dialog, but moving a pending booking from the inbox silently
  // stopped notifying the client once the store started mirroring notifyClient:false. Proves
  // the wiring, not the email content (that's reschedule-notify.test.tsx's job).
  it("raises the Notify-the-client dialog after a successful reschedule", async () => {
    const user = userEvent.setup();
    renderInbox(nurse);

    await user.click(screen.getByRole("button", { name: /reschedule/i }));
    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(rescheduleAppointment).toHaveBeenCalledWith("appt-1", "2026-07-20", 9 * 60, 30, nurse);
    const dialog = await screen.findByRole("dialog", { name: /notify the client/i });
    expect(dialog).toHaveTextContent("Amara Boyd");
    expect(within(dialog).getByRole("button", { name: /send email/i })).toBeInTheDocument();
  });

  it("raises the Notify-the-client dialog after an approve, naming the confirmation", async () => {
    const user = userEvent.setup();
    renderInbox(nurse);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(confirmAppointment).toHaveBeenCalledWith("appt-1", nurse);
    const dialog = await screen.findByRole("dialog", { name: /notify the client/i });
    expect(dialog).toHaveTextContent(/confirmed for/i);
    await user.click(within(dialog).getByRole("button", { name: /send email/i }));
    expect(notifyAppointmentAction).toHaveBeenCalledWith("appt-1", "confirmed");
  });

  it("raises the Notify-the-client dialog after a decline, naming the cancellation", async () => {
    const user = userEvent.setup();
    renderInbox(nurse);
    await user.click(screen.getByRole("button", { name: /decline/i }));
    expect(markAppointment).toHaveBeenCalledWith("appt-1", "cancelled", nurse);
    const dialog = await screen.findByRole("dialog", { name: /notify the client/i });
    expect(dialog).toHaveTextContent(/cancelled — was/i);
    await user.click(within(dialog).getByRole("button", { name: /send email/i }));
    expect(notifyAppointmentAction).toHaveBeenCalledWith("appt-1", "cancelled");
  });

  it("does not raise the dialog when an approve throws", async () => {
    confirmAppointment.mockImplementation(() => {
      throw new Error("gone");
    });
    const user = userEvent.setup();
    renderInbox(nurse);
    await user.click(screen.getByRole("button", { name: /approve/i }));
    await screen.findByText(/actioned elsewhere/i);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not raise the dialog when the reschedule throws", async () => {
    rescheduleAppointment.mockImplementation(() => {
      throw new Error("gone");
    });
    const user = userEvent.setup();
    renderInbox(nurse);
    await user.click(screen.getByRole("button", { name: /reschedule/i }));
    await user.click(screen.getByRole("button", { name: /apply/i }));
    await screen.findByText(/could not move the booking/i);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
