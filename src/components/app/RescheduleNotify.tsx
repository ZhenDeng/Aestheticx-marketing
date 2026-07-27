"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { appointmentChipTitle, appointmentContact } from "@/lib/demo/backend";
import type { Appointment } from "@/lib/demo/types";

// 27/07 feedback: dragging a block used to email the client on EVERY commit — nudging a
// block into place sent the client a run of "your appointment moved" emails. The move now
// commits silently (store.rescheduleAppointment mirrors notifyClient:false) and this asks,
// once, whether to tell them. One prompt at a time: a second move replaces the first rather
// than queueing a backlog of modals, which would be the same friction in a different shape.

const RescheduleNotifyContext = createContext<((apptID: string) => void) | null>(null);

/** Raise the "notify the client?" prompt for an appointment that just moved. */
export function useRescheduleNotify(): (apptID: string) => void {
  const ctx = useContext(RescheduleNotifyContext);
  if (!ctx) throw new Error("useRescheduleNotify must be used within RescheduleNotifyProvider");
  return ctx;
}

export function RescheduleNotifyProvider({ children }: { children: ReactNode }) {
  const [apptID, setApptID] = useState<string | null>(null);
  // Stable across renders so call sites can hold it in a dependency array.
  const prompt = useCallback((id: string) => setApptID(id), []);
  return (
    <RescheduleNotifyContext.Provider value={prompt}>
      {children}
      {apptID && <RescheduleNotifyDialog apptID={apptID} onClose={() => setApptID(null)} />}
    </RescheduleNotifyContext.Provider>
  );
}

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function movedLine(state: ReturnType<typeof useDemoStore>["state"], appt: Appointment): string {
  const title = appointmentChipTitle(state, appt, "Blocked time");
  const day = new Date(`${appt.dateISO}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
  });
  return `${title} · moved to ${day}, ${timeLabel(appt.startMinute)}–${timeLabel(appt.endMinute)}`;
}

// Reads the appointment from the store at RENDER time, not at prompt time, so the copy and
// the email always describe the committed position — never a stale mid-drag one.
function RescheduleNotifyDialog({ apptID, onClose }: { apptID: string; onClose: () => void }) {
  const store = useDemoStore();
  const appt = store.state.appointments[apptID];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The appointment was deleted or reconciled away under us — nothing left to email about.
  if (!appt) return null;

  const contact = appointmentContact(appt, appt.patientID ? store.state.patients[appt.patientID] : undefined);

  return (
    <div role="dialog" aria-modal="true" aria-label="Notify the client"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--color-ink) 45%, transparent)" }}
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl text-ink">Notify the client?</h2>
        <p className="mt-2 text-sm text-ink-soft">{movedLine(store.state, appt)}</p>
        {contact.email ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button"
              onClick={() => { store.notifyAppointmentRescheduled(apptID); onClose(); }}
              className="rounded-btn px-3 py-1.5 text-sm font-medium text-card"
              style={{ background: "var(--color-tint)" }}>
              Send email
            </button>
            <button type="button" onClick={onClose}
              className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft">
              Don&apos;t send
            </button>
          </div>
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
