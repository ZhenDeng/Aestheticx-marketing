"use client";

import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { isoDay, slotsForWindow, isSlotTaken, BackendError } from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
function minutesFromTime(value: string): number {
  const [h, m] = value.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export default function AvailabilityPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Authorisation availability</h1>
      <p className="mt-1 text-ink-soft">
        {identity.role === "doctor" ? "Publish 10-minute teleconsult slots for your nurses to book." : "Book a doctor's open authorisation slot."}
      </p>
      {identity.role === "doctor" ? <DoctorAvailability me={identity} /> : <BookConsult me={identity} />}
    </div>
  );
}

function DoctorAvailability({ me }: { me: Identity }) {
  const store = useDemoStore();
  const todayISO = isoDay(store.now);
  const [date, setDate] = useState(todayISO);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [error, setError] = useState<string | null>(null);
  const windows = store.availabilityWindowsForDoctor(me.user.id);

  function publish() {
    setError(null);
    if (!start || !end) { setError("Enter a start and end time."); return; }
    try {
      store.publishAvailability({ doctorID: me.user.id, dateISO: date, startMinute: minutesFromTime(start), endMinute: minutesFromTime(end) }, me);
    } catch (e) {
      setError(e instanceof BackendError && e.message === "validationFailed" ? "End time must be after the start time." : "Could not publish. Please try again.");
    }
  }
  function withdraw(id: string) {
    setError(null);
    try { store.withdrawAvailability(id, me); }
    catch (e) {
      setError(e instanceof BackendError && e.message === "notActive" ? "That window has bookings and can't be withdrawn." : "Could not withdraw. Please try again.");
    }
  }

  return (
    <>
      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Publish a window</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-soft">Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-sm text-ink-soft">Start
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-sm text-ink-soft">End
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <button onClick={publish} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Publish</button>
        </div>
        {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      </div>

      <h2 className="mt-8 font-display text-lg text-ink">Your windows</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {windows.map((w) => {
          const slots = slotsForWindow(w);
          const open = slots.filter((s) => !isSlotTaken(store.state, w.doctorID, w.dateISO, s)).length;
          const booked = slots.length - open;
          return (
            <li key={w.id} className="flex items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-3">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{w.dateISO} · {timeLabel(w.startMinute)}–{timeLabel(w.endMinute)}</span>
                <span className="micro">{open} open · {booked} booked · {slots.length} slots</span>
              </span>
              <button onClick={() => withdraw(w.id)} className="flex-none rounded-btn border border-line px-3 py-1.5 text-sm" style={{ color: "var(--color-rose)" }}>Withdraw</button>
            </li>
          );
        })}
        {windows.length === 0 && <li className="text-sm text-ink-soft">No windows published.</li>}
      </ul>
    </>
  );
}

function BookConsult({ me }: { me: Identity }) {
  const store = useDemoStore();
  const todayISO = isoDay(store.now);
  const [doctors, setDoctors] = useState<{ doctorID: string; doctorName: string }[]>([]);
  const [doctorID, setDoctorID] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO);
  const [slots, setSlots] = useState<number[]>([]);
  const [slot, setSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotReload, setSlotReload] = useState(0);

  // Fall back to the first available doctor so one is selectable without touching the dropdown.
  const effectiveDoctorID = doctorID ?? doctors[0]?.doctorID ?? null;

  // Discover doctors with availability (demo: local selectors; live: backend callable).
  useEffect(() => {
    let alive = true;
    store.listAvailableDoctors().then((d) => { if (alive) { setDoctors(d); setLoading(false); } });
    return () => { alive = false; };
  }, [store]);

  // The chosen doctor's open slots for the date; refetched after a booking (slotReload).
  useEffect(() => {
    if (!effectiveDoctorID) return; // only null when there are no doctors (guarded below)
    let alive = true;
    store.listDoctorOpenSlots(effectiveDoctorID, date).then((s) => { if (alive) setSlots(s); });
    return () => { alive = false; };
  }, [store, effectiveDoctorID, date, slotReload]);

  const matches = slot !== null && query.trim() ? store.searchPatients(query, me).slice(0, 5) : [];

  async function book(patientID: string, patientName: string) {
    if (!effectiveDoctorID || slot === null) return;
    setError(null);
    const at = slot;
    try {
      await store.bookAuthSlot({ doctorID: effectiveDoctorID, dateISO: date, startMinute: at, patientID, patientName, identity: me });
      setBooked(`Booked ${timeLabel(at)} for ${patientName}.`);
      setSlot(null); setQuery("");
    } catch (e) {
      setError(e instanceof BackendError && e.message === "slotTaken"
        ? "That slot was just taken — pick another."
        : "That slot is no longer available — pick another.");
      setSlot(null);
    } finally {
      setSlotReload((t) => t + 1); // reflect the booking (or a lost race) in the open list
    }
  }

  if (loading) return <p className="mt-6 text-sm text-ink-soft">Loading availability…</p>;
  if (doctors.length === 0) return <p className="mt-6 text-sm text-ink-soft">No doctors have published availability yet.</p>;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-ink-soft">Doctor
          <select value={effectiveDoctorID ?? ""} onChange={(e) => { setDoctorID(e.target.value); setSlot(null); }} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink">
            {doctors.map((d) => <option key={d.doctorID} value={d.doctorID}>{d.doctorName}</option>)}
          </select>
        </label>
        <label className="text-sm text-ink-soft">Date
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
        </label>
      </div>

      {booked && <p className="text-sm" style={{ color: "var(--color-tint)" }}>{booked}</p>}
      {error && <p className="text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

      <div>
        <h2 className="font-display text-lg text-ink">Open slots</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {slots.map((s) => (
            <button key={s} onClick={() => { setSlot(s); setBooked(null); }}
              className="rounded-btn border px-3 py-1.5 text-sm"
              style={slot === s ? { background: "var(--color-tint)", color: "var(--color-card)", borderColor: "var(--color-tint)" } : { borderColor: "var(--color-line)", color: "var(--color-ink)" }}>
              {timeLabel(s)}
            </button>
          ))}
          {slots.length === 0 && <p className="text-sm text-ink-soft">No open slots on this date.</p>}
        </div>
      </div>

      {slot !== null && (
        <div className="rounded-inner border border-line bg-card p-4">
          <p className="text-sm text-ink">Book {timeLabel(slot)} for…</p>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient…"
            className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
          <ul className="mt-1 flex flex-col gap-1">
            {matches.map((p) => (
              <li key={p.id}>
                <button onClick={() => book(p.id, `${p.givenName} ${p.lastName}`)}
                  className="w-full rounded-inner border border-line px-3 py-1.5 text-left text-sm text-ink hover:border-tint">
                  {p.givenName} {p.lastName}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
