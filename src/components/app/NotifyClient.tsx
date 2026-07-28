"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { appointmentChipTitle, appointmentContact } from "@/lib/demo/backend";
import type { Appointment } from "@/lib/demo/types";

// 27/07 feedback: dragging a block used to email the client on EVERY commit — nudging a
// block into place sent the client a run of "your appointment moved" emails. 28/07 sweep:
// approving and declining a booking auto-emailed the same way. Every one of those actions
// now commits silently (the store mirrors notifyClient:false) and this asks, once, whether
// to tell the client. One prompt at a time: a second action replaces the first rather than
// queueing a backlog of modals, which would be the same friction in a different shape.

/** The booking emails a practitioner can send from the Notify dialog. */
export type NotifyClientAction = "rescheduled" | "confirmed" | "cancelled";

interface PendingNotify {
  apptID: string;
  action: NotifyClientAction;
}

const NotifyClientContext = createContext<((apptID: string, action: NotifyClientAction) => void) | null>(null);

/** Raise the "notify the client?" prompt for an appointment that was just actioned. */
export function useNotifyClient(): (apptID: string, action: NotifyClientAction) => void {
  const ctx = useContext(NotifyClientContext);
  if (!ctx) throw new Error("useNotifyClient must be used within NotifyClientProvider");
  return ctx;
}

export function NotifyClientProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingNotify | null>(null);
  // Stable across renders so call sites can hold it in a dependency array.
  const prompt = useCallback((apptID: string, action: NotifyClientAction) => setPending({ apptID, action }), []);
  return (
    <NotifyClientContext.Provider value={prompt}>
      {children}
      {pending && <NotifyClientDialog pending={pending} onClose={() => setPending(null)} />}
    </NotifyClientContext.Provider>
  );
}

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function actionLine(state: ReturnType<typeof useDemoStore>["state"], appt: Appointment, action: NotifyClientAction): string {
  const title = appointmentChipTitle(state, appt, "Blocked time");
  const day = new Date(`${appt.dateISO}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
  });
  const when = `${day}, ${timeLabel(appt.startMinute)}–${timeLabel(appt.endMinute)}`;
  if (action === "confirmed") return `${title} · confirmed for ${when}`;
  if (action === "cancelled") return `${title} · cancelled — was ${when}`;
  return `${title} · moved to ${when}`;
}

// Reads the appointment from the store at RENDER time, not at prompt time, so the copy and
// the email always describe the committed record — never a stale mid-drag one.
function NotifyClientDialog({ pending, onClose }: { pending: PendingNotify; onClose: () => void }) {
  const store = useDemoStore();
  const appt = store.state.appointments[pending.apptID];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The appointment was deleted or reconciled away under us — nothing left to email about.
  if (!appt) return null;

  const contact = appointmentContact(appt, appt.patientID ? store.state.patients[appt.patientID] : undefined);
  // The action's mirror may still be in flight — cold-start latency is seconds, not
  // milliseconds — so a Send click could reach the notify callable (which re-reads the
  // appointment server-side) before the change commits, emailing the pre-change record.
  // Worse, if the mirror then FAILS, the store rehydrates and reverts, but an already-sent
  // Send would have emailed a change that never happened. store.refreshing folds in
  // pendingWrites, which the reschedule/confirm/cancel store actions bump for exactly these
  // writes (see src/lib/demo/store.tsx).
  const saving = store.refreshing;

  return (
    // role/aria-modal/aria-label live on the PANEL, not this scrim: the scrim is also the
    // click-to-dismiss target, so putting the dialog role here would make the accessible
    // dialog span the whole viewport instead of just the card.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--color-ink) 45%, transparent)" }}
      onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Notify the client"
        className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl text-ink">Notify the client?</h2>
        <p className="mt-2 text-sm text-ink-soft">{actionLine(store.state, appt, pending.action)}</p>
        {contact.email ? (
          <>
            {saving && <p className="mt-3 text-sm text-ink-soft">Saving the change…</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button"
                onClick={() => { store.notifyAppointmentAction(pending.apptID, pending.action); onClose(); }}
                disabled={saving}
                className="rounded-btn px-3 py-1.5 text-sm font-medium text-card disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "var(--color-tint)" }}>
                Send email
              </button>
              {/* Always enabled — a practitioner must be able to dismiss the prompt even
                  while the underlying write is still saving. */}
              <button type="button" onClick={onClose}
                className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft">
                Don&apos;t send
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-soft">No client contact on file — no email will be sent.</p>
            <div className="mt-4">
              <button type="button" onClick={onClose}
                className="rounded-btn px-3 py-1.5 text-sm font-medium text-card"
                style={{ background: "var(--color-tint)" }}>
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
