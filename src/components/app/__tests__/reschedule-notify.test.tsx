// The calendar no longer emails on every drag (2026-07-27). A move commits immediately and
// this dialog asks whether to tell the client. Driven through the real demo store so the
// dialog's contact resolution and copy are exercised, not stubbed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { emptyState } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { Appointment } from "@/lib/demo/types";

const VOSS = DEMO_ACCOUNTS[2].identities[0];

const WITH_EMAIL: Appointment = {
  id: "a-email", ownerID: VOSS.user.id, type: "treatment", status: "confirmed",
  dateISO: "2026-08-03", startMinute: 600, endMinute: 660,
  lead: { givenName: "Anna", lastName: "Chen", email: "anna@example.com" },
};
const NO_EMAIL: Appointment = {
  id: "a-blocked", ownerID: VOSS.user.id, type: "treatment", status: "confirmed",
  dateISO: "2026-08-03", startMinute: 540, endMinute: 600,
};

vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => false }));

const notifySpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/demo/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo/store")>();
  return {
    ...actual,
    useDemoStore: () => ({
      ...actual.useDemoStore(),
      state: { ...emptyState(), appointments: { [WITH_EMAIL.id]: WITH_EMAIL, [NO_EMAIL.id]: NO_EMAIL } },
      notifyAppointmentRescheduled: notifySpy,
    }),
  };
});

import { DemoAuthProvider } from "@/lib/demo/auth";
import { DemoStoreProvider } from "@/lib/demo/store";
import { RescheduleNotifyProvider, useRescheduleNotify } from "@/components/app/RescheduleNotify";

// A button that raises the prompt for a given appointment, standing in for a drag commit.
function Trigger({ apptID }: { apptID: string }) {
  const prompt = useRescheduleNotify();
  return <button onClick={() => prompt(apptID)}>__moved_{apptID}__</button>;
}

// DemoStoreProvider reads `mode` off useDemoAuth internally (unmocked — the store mock above
// only overrides useDemoStore's return value, not the provider), so it still needs a real
// DemoAuthProvider ancestor even though this suite never signs in.
function Harness({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoStoreProvider><RescheduleNotifyProvider>{children}</RescheduleNotifyProvider></DemoStoreProvider>
    </DemoAuthProvider>
  );
}

describe("RescheduleNotify dialog", () => {
  beforeEach(() => { notifySpy.mockClear(); });

  it("does not render until a move raises it", () => {
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /></Harness>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the client and the new time, and sends on Send email", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-email__" }));
    const dialog = await screen.findByRole("dialog", { name: /notify the client/i });
    expect(dialog).toHaveTextContent("Anna Chen");
    expect(dialog).toHaveTextContent("10:00");
    await user.click(screen.getByRole("button", { name: /send email/i }));
    expect(notifySpy).toHaveBeenCalledWith(WITH_EMAIL.id);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes without sending on Don't send", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-email__" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /don't send/i }));
    expect(notifySpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes without sending on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-email__" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(notifySpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers only OK, and sends nothing, when there is no client contact", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={NO_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-blocked__" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/no client contact on file/i);
    expect(screen.queryByRole("button", { name: /send email/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(notifySpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a single dialog when a second move arrives first", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID={WITH_EMAIL.id} /><Trigger apptID={NO_EMAIL.id} /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-email__" }));
    await user.click(screen.getByRole("button", { name: "__moved_a-blocked__" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveTextContent(/no client contact on file/i);
  });

  it("closes itself if the appointment disappears", async () => {
    const user = userEvent.setup();
    render(<Harness><Trigger apptID="a-deleted" /></Harness>);
    await user.click(screen.getByRole("button", { name: "__moved_a-deleted__" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("throws when called outside RescheduleNotifyProvider", () => {
    // Matches the fail-loud contract of every sibling context in this codebase (useDemoStore,
    // useDemoAuth, useConsultCall): a call site added outside the provider must blow up loudly,
    // not silently swallow the prompt. React logs the render-phase error to console.error even
    // though it's caught here — suppressed the same way auth-live-watcher.test.tsx does.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useRescheduleNotify())).toThrow(
      "useRescheduleNotify must be used within RescheduleNotifyProvider",
    );
    errorSpy.mockRestore();
  });
});
