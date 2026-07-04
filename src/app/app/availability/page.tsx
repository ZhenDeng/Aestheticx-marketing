"use client";

import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { isoDay, nowFlooredTo10, isPastSlot, slotsForWindow, isSlotTaken, BackendError } from "@/lib/demo/backend";
import { LeadFields, leadFromDraft, emptyLeadDraft, type LeadDraft } from "@/components/app/LeadFields";
import type { AppointmentLead, DaySchedule, Identity } from "@/lib/demo/types";

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
  const [tab, setTab] = useState<"authorisation" | "treatment">("authorisation");
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  if (store.status === "error") return <p className="text-ink-soft">Could not load data. Open the dashboard to retry.</p>;

  return (
    <div>
      <h1 className="font-display text-3xl text-ink">Availability</h1>
      <div className="mt-4 flex gap-2">
        {(["authorisation", "treatment"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="rounded-btn border px-3 py-1.5 text-sm"
            style={tab === t ? { background: "var(--color-tint)", color: "var(--color-card)", borderColor: "var(--color-tint)" } : { borderColor: "var(--color-line)", color: "var(--color-ink)" }}>
            {t === "authorisation" ? "Authorisation" : "Treatment"}
          </button>
        ))}
      </div>
      {tab === "authorisation"
        ? (identity.role === "doctor" ? <DoctorAvailability me={identity} /> : <BookConsult me={identity} />)
        : <TreatmentSchedule me={identity} />}
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
  const status = store.doctorStatusForUser(me.user.id);

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
        <h2 className="font-display text-lg text-ink">Your status</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={status.online}
              onChange={(e) => store.setDoctorStatus(me.user.id, { online: e.target.checked })} />
            I&apos;m online now
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={status.alwaysAcceptAuth}
              onChange={(e) => store.setDoctorStatus(me.user.id, { alwaysAcceptAuth: e.target.checked })} />
            Always accept authorisation requests
          </label>
        </div>
      </div>

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

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function TreatmentSchedule({ me }: { me: Identity }) {
  const store = useDemoStore();
  const ownerID = me.context.kind === "clinic" ? me.context.clinic.id : me.user.id;
  const config = store.treatmentAvailabilityForOwner(ownerID);
  const [blockDate, setBlockDate] = useState(isoDay(store.now));
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [error, setError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);

  function updateDay(i: number, patch: Partial<DaySchedule>) {
    setDayError(null);
    try { store.setTreatmentDaySchedule(ownerID, i, patch); }
    catch { setDayError("Open time must be before close time."); }
  }

  function addBlock() {
    setError(null);
    const s = minutesFromTime(blockStart), e = minutesFromTime(blockEnd);
    if (e <= s) { setError("End time must be after the start time."); return; }
    try { store.addTreatmentBlock(ownerID, { dateISO: blockDate, startMinute: s, endMinute: e }); }
    catch { setError("Could not add the block. Please try again."); }
  }

  return (
    <>
      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Weekly schedule</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {config.days.map((d, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3">
              <span className="w-10 text-sm text-ink">{WEEKDAY_LABELS[i]}</span>
              <label className="flex items-center gap-1 text-sm text-ink-soft">
                <input type="checkbox" checked={d.open}
                  onChange={(ev) => updateDay(i, { open: ev.target.checked })} />
                Open
              </label>
              <input type="time" value={timeLabel(d.openMinute)} disabled={!d.open}
                onChange={(ev) => updateDay(i, { openMinute: minutesFromTime(ev.target.value) })}
                className="rounded-field border border-line px-2 py-1 text-sm text-ink disabled:opacity-40" />
              <span className="text-ink-soft">–</span>
              <input type="time" value={timeLabel(d.closeMinute)} disabled={!d.open}
                onChange={(ev) => updateDay(i, { closeMinute: minutesFromTime(ev.target.value) })}
                className="rounded-field border border-line px-2 py-1 text-sm text-ink disabled:opacity-40" />
            </li>
          ))}
        </ul>
        {dayError && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{dayError}</p>}
      </div>

      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-lg text-ink">Blocked times</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-soft">Date
            <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-sm text-ink-soft">Start
            <input type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-sm text-ink-soft">End
            <input type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
          </label>
          <button onClick={addBlock} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>Add block</button>
        </div>
        {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
        <ul className="mt-3 flex flex-col gap-2">
          {config.blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 rounded-inner border border-line px-4 py-2">
              <span className="text-sm text-ink">{b.dateISO} · {timeLabel(b.startMinute)}–{timeLabel(b.endMinute)}</span>
              <button onClick={() => store.removeTreatmentBlock(ownerID, b.id)} className="rounded-btn border border-line px-3 py-1 text-sm" style={{ color: "var(--color-rose)" }}>Remove</button>
            </li>
          ))}
          {config.blocks.length === 0 && <li className="text-sm text-ink-soft">No blocked times.</li>}
        </ul>
      </div>

      <ExternalCalendarCard ownerID={ownerID} />
    </>
  );
}

// Google Calendar link + two-way sync (spec: calendar sync). Linking and token storage run
// server-side (the deployed OAuth callables); "connected" isn't client-knowable — like iOS,
// link then sync, and a failed sync says to link first. Apple Calendar sync is on-device in
// the iOS app; its busy times land in the same externalBusy doc and render here regardless.
function ExternalCalendarCard({ ownerID }: { ownerID: string }) {
  const store = useDemoStore();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentUrl, setConsentUrl] = useState<string | null>(null);
  const [busyWorking, setBusyWorking] = useState(false);
  const isLive = store.status !== "demo";
  const cal = store.state.externalBusyByOwner[ownerID];

  async function linkGoogle() {
    setError(null);
    setConsentUrl(null);
    try {
      const url = await store.googleCalendarAuthUrl();
      if (!url) {
        setError("Could not start Google linking. Please try again.");
        return;
      }
      // The await broke the user-gesture chain, so popup blockers may stop window.open —
      // when they do, fall back to a real link the user can click directly.
      const opened = window.open(url, "_blank", "noopener");
      if (opened) {
        setStatus("Opened Google consent. After approving, return and press Sync now.");
      } else {
        setStatus(null);
        setConsentUrl(url);
      }
    } catch {
      setError("Could not start Google linking. Please try again.");
    }
  }

  async function syncNow() {
    setError(null);
    setBusyWorking(true);
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney";
      const r = await store.syncGoogleCalendar(zone, ownerID);
      setStatus(`Synced — ${r.busyCount} busy time${r.busyCount === 1 ? "" : "s"}, ${r.mirrored} appointment${r.mirrored === 1 ? "" : "s"} mirrored to Google.`);
    } catch {
      setError("Sync failed — make sure Google Calendar is linked.");
    } finally {
      setBusyWorking(false);
    }
  }

  return (
    <div className="mt-6 rounded-card border border-line bg-card p-5">
      <h2 className="font-display text-lg text-ink">External calendar</h2>
      <p className="mt-2 text-sm text-ink-soft">
        Link your Google Calendar so times you&apos;re committed elsewhere block public and self-service
        booking, and confirmed appointments appear on your calendar. Busy times show on the day and
        week views. Apple Calendar sync runs on-device in the iOS app.
      </p>
      {!isLive && (
        <p className="mt-2 rounded-inner border-l-4 p-2 text-sm" style={{ borderColor: "var(--color-tint)", background: "var(--color-tint-soft)" }}>
          Demo — linking needs a live account; the seeded busy times below stand in for a synced calendar.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {isLive && (
          <button onClick={() => void linkGoogle()}
                  className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            Link Google Calendar
          </button>
        )}
        <button onClick={() => void syncNow()} disabled={busyWorking}
                className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint disabled:opacity-50">
          {busyWorking ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {consentUrl && (
        <p className="mt-2 text-sm text-ink">
          Your browser blocked the consent window —{" "}
          <a href={consentUrl} target="_blank" rel="noreferrer noopener" onClick={() => setStatus("Opened Google consent. After approving, return and press Sync now.")}
             className="underline decoration-line underline-offset-2 hover:decoration-tint">
            open the Google consent page
          </a>.
        </p>
      )}
      {status && <p className="mt-2 text-sm" style={{ color: "var(--color-sage)" }}>{status}</p>}
      {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      {cal && (
        <p className="mt-2 micro">
          {cal.events.length} synced busy time{cal.events.length === 1 ? "" : "s"} · zone {cal.timeZone}
          {cal.updatedAtMillis ? ` · updated ${new Date(cal.updatedAtMillis).toLocaleString()}` : ""}
        </p>
      )}
    </div>
  );
}

function BookConsult({ me }: { me: Identity }) {
  const store = useDemoStore();
  const todayISO = isoDay(store.now);
  const [doctors, setDoctors] = useState<{ doctorID: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }[]>([]);
  const [doctorID, setDoctorID] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO);
  const [slots, setSlots] = useState<number[]>([]);
  const [slot, setSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotReload, setSlotReload] = useState(0);
  const [adHocQuery, setAdHocQuery] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [slotNewPatient, setSlotNewPatient] = useState(false);
  const [slotLeadDraft, setSlotLeadDraft] = useState<LeadDraft>(emptyLeadDraft());
  const [adHocNewPatient, setAdHocNewPatient] = useState(false);
  const [adHocLeadDraft, setAdHocLeadDraft] = useState<LeadDraft>(emptyLeadDraft());
  const [adHocWhen, setAdHocWhen] = useState<"now" | "later">("now");
  const [adHocDate, setAdHocDate] = useState(todayISO);
  const [adHocTime, setAdHocTime] = useState(timeLabel(nowFlooredTo10(store.now)));

  // Fall back to the first available doctor so one is selectable without touching the dropdown.
  const effectiveDoctorID = doctorID ?? doctors[0]?.doctorID ?? null;
  const effectiveDoctor = doctors.find((d) => d.doctorID === effectiveDoctorID) ?? null;
  const canRequestAdHoc = !!effectiveDoctor && (effectiveDoctor.online || effectiveDoctor.alwaysAcceptAuth);

  // The ad-hoc target slot: "now" mirrors the doctor's real-time acceptance; "later" books
  // any chosen slot (an always-accepting doctor takes requests at any time — never gated by
  // published slots or treatment hours). Coordinates stay in the isoDay/nowFlooredTo10 UTC frame.
  const adHocDateISO = adHocWhen === "now" ? isoDay(store.now) : adHocDate;
  const adHocMinute = adHocWhen === "now" ? nowFlooredTo10(store.now) : minutesFromTime(adHocTime);
  // A cleared time field would coerce to midnight via minutesFromTime("") — treat it as not-ready
  // instead of past so no request can target an unintended 00:00 slot.
  const adHocEmpty = adHocWhen === "later" && (adHocDate.trim() === "" || adHocTime.trim() === "");
  const adHocPast = adHocWhen === "later" && !adHocEmpty && isPastSlot(adHocDateISO, adHocMinute, store.now);
  const adHocBlocked = adHocEmpty || adHocPast;

  // Discover doctors with availability (demo: local selectors; live: backend callable).
  useEffect(() => {
    let alive = true;
    store.listAvailableDoctors()
      .then((d) => { if (alive) { setDoctors(d); setLoading(false); } })
      .catch(() => { if (alive) { setError("Could not load availability. Please retry."); setLoading(false); } });
    return () => { alive = false; };
  }, [store]);

  // The chosen doctor's open slots for the date; refetched after a booking (slotReload).
  useEffect(() => {
    if (!effectiveDoctorID) return; // only null when there are no doctors (guarded below)
    let alive = true;
    store.listDoctorOpenSlots(effectiveDoctorID, date)
      .then((s) => { if (alive) setSlots(s); })
      .catch(() => { if (alive) setError("Could not load open slots. Please retry."); });
    return () => { alive = false; };
  }, [store, effectiveDoctorID, date, slotReload]);

  const matches = slot !== null && query.trim() ? store.searchPatients(query, me).slice(0, 5) : [];

  // Books the picked slot for an existing patient file XOR a new-patient lead.
  async function book(patient: { patientID: string; patientName: string } | { lead: AppointmentLead }) {
    if (!effectiveDoctorID || slot === null) return;
    setError(null);
    const at = slot;
    const forName = "lead" in patient
      ? `${`${patient.lead.givenName} ${patient.lead.lastName}`.trim()} (new patient)`
      : patient.patientName;
    try {
      await store.bookAuthSlot({ doctorID: effectiveDoctorID, dateISO: date, startMinute: at, ...patient, identity: me });
      setBooked(`Booked ${timeLabel(at)} for ${forName}.`);
      setSlot(null); setQuery(""); setSlotNewPatient(false); setSlotLeadDraft(emptyLeadDraft());
    } catch (e) {
      setError(e instanceof BackendError && e.message === "slotTaken"
        ? "That slot was just taken — pick another."
        : "That slot is no longer available — pick another.");
      setSlot(null);
    } finally {
      setSlotReload((t) => t + 1); // reflect the booking (or a lost race) in the open list
    }
  }

  const adHocMatches = adHocQuery.trim() ? store.searchPatients(adHocQuery, me).slice(0, 5) : [];

  // Sends an ad-hoc request ("now" or a chosen slot) for an existing patient file XOR a
  // new-patient lead.
  async function requestAdHoc(patient: { patientID: string; patientName: string } | { lead: AppointmentLead }) {
    if (!effectiveDoctorID || adHocBlocked) return;
    setError(null);
    setRequesting(true);
    const forName = "lead" in patient
      ? `${`${patient.lead.givenName} ${patient.lead.lastName}`.trim()} (new patient)`
      : patient.patientName;
    try {
      await store.requestAdHocAuth({
        doctorID: effectiveDoctorID, dateISO: adHocDateISO, atMinute: adHocMinute,
        ...patient, identity: me,
      });
      setBooked(adHocWhen === "later"
        ? `Sent an ad-hoc request for ${forName} — ${adHocDateISO} at ${timeLabel(adHocMinute)}.`
        : `Sent an ad-hoc request for ${forName}.`);
      setAdHocQuery(""); setAdHocNewPatient(false); setAdHocLeadDraft(emptyLeadDraft());
    } catch (e) {
      setError(e instanceof BackendError && e.message === "notAccepting"
        ? "That doctor isn't accepting requests right now — pick another."
        : "Could not send the request. Please try again.");
    } finally {
      setRequesting(false);
    }
  }

  if (loading) return <p className="mt-6 text-sm text-ink-soft">Loading availability…</p>;
  if (doctors.length === 0) return <p className="mt-6 text-sm text-ink-soft">No doctors are available right now.</p>;

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

      {canRequestAdHoc && (
        <div className="rounded-inner border border-line bg-card p-4">
          <p className="text-sm text-ink">Request an ad-hoc consult for…</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-ink">
            <label className="flex items-center gap-2">
              <input type="radio" name="adhoc-when" disabled={requesting} checked={adHocWhen === "now"} onChange={() => setAdHocWhen("now")} />
              Now
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="adhoc-when" disabled={requesting} checked={adHocWhen === "later"} onChange={() => setAdHocWhen("later")} />
              Pick a time
            </label>
          </div>
          {adHocWhen === "later" && (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="text-sm text-ink-soft">Date
                <input type="date" min={todayISO} disabled={requesting} value={adHocDate} onChange={(e) => setAdHocDate(e.target.value)}
                  className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
              </label>
              <label className="text-sm text-ink-soft">Time
                <input type="time" step={600} disabled={requesting} value={adHocTime} onChange={(e) => setAdHocTime(e.target.value)}
                  className="ml-2 rounded-field border border-line px-2 py-1 text-sm text-ink" />
              </label>
              {adHocPast && <p className="text-sm" style={{ color: "var(--color-rose)" }}>Pick a time that isn&apos;t in the past.</p>}
            </div>
          )}
          <label className="mt-2 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={adHocNewPatient} onChange={(e) => { setAdHocNewPatient(e.target.checked); setAdHocQuery(""); }} />
            New patient (no file yet)
          </label>
          {adHocNewPatient ? (
            <div className="mt-2">
              <LeadFields value={adHocLeadDraft} onChange={setAdHocLeadDraft} />
              <button disabled={requesting || adHocBlocked || leadFromDraft(adHocLeadDraft) === null}
                onClick={() => { const lead = leadFromDraft(adHocLeadDraft); if (lead) void requestAdHoc({ lead }); }}
                className="mt-2 rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40" style={{ background: "var(--color-tint)" }}>
                Request for new patient
              </button>
            </div>
          ) : (
            <>
              <input value={adHocQuery} onChange={(e) => setAdHocQuery(e.target.value)} placeholder="Search by name, DOB (dd/mm/yyyy), or phone"
                className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
              <ul className="mt-1 flex flex-col gap-1">
                {adHocMatches.map((p) => (
                  <li key={p.id}>
                    <button disabled={requesting || adHocBlocked} onClick={() => requestAdHoc({ patientID: p.id, patientName: `${p.givenName} ${p.lastName}` })}
                      className="w-full rounded-inner border border-line px-3 py-1.5 text-left text-sm text-ink hover:border-tint disabled:opacity-50">
                      {p.givenName} {p.lastName}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {slot !== null && (
        <div className="rounded-inner border border-line bg-card p-4">
          <p className="text-sm text-ink">Book {timeLabel(slot)} for…</p>
          <label className="mt-2 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={slotNewPatient} onChange={(e) => { setSlotNewPatient(e.target.checked); setQuery(""); }} />
            New patient (no file yet)
          </label>
          {slotNewPatient ? (
            <div className="mt-2">
              <LeadFields value={slotLeadDraft} onChange={setSlotLeadDraft} />
              <button disabled={leadFromDraft(slotLeadDraft) === null}
                onClick={() => { const lead = leadFromDraft(slotLeadDraft); if (lead) void book({ lead }); }}
                className="mt-2 rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-40" style={{ background: "var(--color-tint)" }}>
                Book for new patient
              </button>
            </div>
          ) : (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, DOB (dd/mm/yyyy), or phone"
                className="mt-2 w-full rounded-inner border border-line px-3 py-2 text-sm text-ink outline-none focus:border-tint" />
              <ul className="mt-1 flex flex-col gap-1">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => book({ patientID: p.id, patientName: `${p.givenName} ${p.lastName}` })}
                      className="w-full rounded-inner border border-line px-3 py-1.5 text-left text-sm text-ink hover:border-tint">
                      {p.givenName} {p.lastName}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
