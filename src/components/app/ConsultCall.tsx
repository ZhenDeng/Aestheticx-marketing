"use client";

// Consult-call web slice (appointments spec §"Consult call launch and incoming-call ringing").
// Live mode rings the other party's iPhone via the deployed startConsultCall callable and
// joins the LiveKit room in the browser; demo mode simulates the call locally (no transport).
// Background/lock-screen ringing is iOS-native (PushKit/CallKit) — a web callee only rings
// while the app is open, via the same consultSignals doc iOS uses as its in-app baseline.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { heldIdentities, prescriberIdentity } from "@/lib/demo/identity";
import { incomingCallFromSignal, callDisplayName, LIVEKIT_URL, type IncomingCall } from "@/lib/demo/calls";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import type { AuthorisationRequest, Identity } from "@/lib/demo/types";
import type { Room } from "livekit-client";

interface ActiveCall {
  requestID: string;
  /** Header line: the patient (outgoing) or "caller · patient" (incoming). */
  title: string;
  phase: "starting" | "demo" | "live" | "error";
  token?: string;
  room?: string;
  /** VoIP pushes delivered by startConsultCall; 0 → the other party may be offline. */
  delivered?: number;
  errorMessage?: string;
}

interface ConsultCallValue {
  /** Start an outgoing consult on an authorisation request. */
  start: (requestID: string, patientName?: string) => void;
  active: boolean;
}

const ConsultCallContext = createContext<ConsultCallValue | null>(null);

export function useConsultCall(): ConsultCallValue {
  const v = useContext(ConsultCallContext);
  if (!v) throw new Error("useConsultCall outside ConsultCallProvider");
  return v;
}

export function ConsultCallProvider({ children }: { children: ReactNode }) {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  const [call, setCall] = useState<ActiveCall | null>(null);

  const start = useCallback((requestID: string, patientName?: string) => {
    if (!identity) return;
    const title = patientName ? `Consult · ${patientName}` : "Authorisation consult";
    setCall({ requestID, title, phase: "starting" });
    void (async () => {
      try {
        const res = await store.startConsult(requestID, identity);
        setCall((c) => c?.requestID !== requestID ? c : res.mode === "demo"
          ? { ...c, phase: "demo" }
          : { ...c, phase: "live", token: res.token, room: res.room, delivered: res.delivered });
      } catch {
        setCall((c) => (c?.requestID === requestID
          ? { ...c, phase: "error", errorMessage: "Couldn't start the call. Please try again." }
          : c));
      }
    })();
  }, [store, identity]);

  // Incoming ring (live only): a valid consultSignals/{uid} doc rings while the app is open.
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const uid = identity?.user.id ?? null;
  useEffect(() => {
    if (!isFirebaseConfigured() || !uid) return;
    let unsubscribe = () => {};
    let expireTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    void (async () => {
      const [{ doc, onSnapshot }, { firestore }] = await Promise.all([
        import("firebase/firestore"),
        import("@/lib/firebase/client"),
      ]);
      if (disposed) return;
      unsubscribe = onSnapshot(doc(firestore(), "consultSignals", uid), (snap) => {
        clearTimeout(expireTimer);
        const data = snap.data();
        const parsed = data ? incomingCallFromSignal(data, Date.now()) : null;
        setIncoming(parsed);
        // The ring window is server-stamped; silence the banner when it lapses unanswered.
        const expires = data?.expiresAtMillis;
        if (parsed && typeof expires === "number") {
          expireTimer = setTimeout(() => setIncoming(null), Math.max(0, expires - Date.now()));
        }
      });
    })();
    return () => { disposed = true; clearTimeout(expireTimer); unsubscribe(); };
  }, [uid]);

  const consumeSignal = useCallback(async () => {
    if (!uid) return;
    const [{ doc, deleteDoc }, { firestore }] = await Promise.all([
      import("firebase/firestore"),
      import("@/lib/firebase/client"),
    ]);
    await deleteDoc(doc(firestore(), "consultSignals", uid)); // callee-consume per rules
  }, [uid]);

  const accept = useCallback((inc: IncomingCall) => {
    setIncoming(null);
    setCall({ requestID: inc.requestID, title: callDisplayName(inc.callerName, inc.patientName), phase: "starting" });
    void (async () => {
      try {
        await consumeSignal();
        const m = await import("@/lib/firebase/mirror");
        const { token, room } = await m.mirrorMintCallToken(inc.requestID);
        setCall((c) => (c?.requestID === inc.requestID ? { ...c, phase: "live", token, room } : c));
      } catch {
        setCall((c) => (c?.requestID === inc.requestID
          ? { ...c, phase: "error", errorMessage: "Couldn't join the call. Please try again." }
          : c));
      }
    })();
  }, [consumeSignal]);

  const decline = useCallback(() => {
    setIncoming(null);
    void consumeSignal().catch(() => {}); // a failed delete just lets the signal expire
  }, [consumeSignal]);

  return (
    <ConsultCallContext.Provider value={{ start, active: call !== null }}>
      {children}
      {incoming && !call && (
        <div role="alert" className="fixed right-4 top-20 z-50 w-80 rounded-card border border-line bg-card p-4 shadow-card">
          <p className="micro">Incoming consult</p>
          <p className="mt-1 font-medium text-ink">{callDisplayName(incoming.callerName, incoming.patientName)}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => accept(incoming)} className="flex-1 rounded-btn px-3 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
              Accept
            </button>
            <button onClick={decline} className="flex-1 rounded-btn border border-line px-3 py-2 text-sm" style={{ color: "var(--color-rose)" }}>
              Decline
            </button>
          </div>
        </div>
      )}
      {call && <CallOverlay call={call} onEnd={() => setCall(null)} />}
    </ConsultCallContext.Provider>
  );
}

function formatElapsed(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

type Store = ReturnType<typeof useDemoStore>;

// Approve / Require edit while the request is still pending; afterwards a status pill so a
// decision made mid-call (or by anyone else, via the live listeners) sticks visibly.
function DecisionActions({ request, doctor, store }: { request: AuthorisationRequest; doctor: Identity; store: Store }) {
  if (request.status === "pending") {
    return (
      <div className="flex flex-wrap gap-2">
        <button onClick={() => store.approveRequest(request.id, doctor)}
          className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          Approve
        </button>
        <button onClick={() => store.requireEdit(request.id, doctor)}
          className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
          Require edit
        </button>
      </div>
    );
  }
  const label = request.status === "approved" ? "Approved"
    : request.status === "needsEdit" ? "Returned for edit"
    : "Withdrawn by the nurse";
  return (
    <span className="micro inline-flex rounded-full px-2 py-0.5" style={{ background: "var(--color-tint-soft)", color: "var(--color-tint)" }}>
      {label}
    </span>
  );
}

// The in-call review panel (owner feature 2026-07-13): the request's embedded
// patientSummary — available even before the patient doc loads — so the doctor can assess
// the patient while on the call, plus the requested items and the decision actions.
function CallReviewPanel({ request, doctor, store }: { request: AuthorisationRequest; doctor: Identity; store: Store }) {
  const s = request.patientSummary;
  const dob = s?.dateOfBirth;
  return (
    <aside aria-label="Patient review" className="rounded-inner p-4" style={{ background: "var(--color-umber-soft)" }}>
      <p className="micro">Patient</p>
      <Link href={`/app/patients/${request.patientID}`} className="font-medium text-ink underline-offset-2 hover:text-tint hover:underline">
        {s?.fullName ?? "Unknown patient"}
      </Link>
      {s?.alert && (
        <p className="mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}>
          ⚠ {s.alert}
        </p>
      )}
      {dob && <p className="mt-1 text-sm text-ink-soft">DOB: {dob.day}/{dob.month}/{dob.year}</p>}
      <p className="mt-1 text-sm text-ink-soft">Allergies: {s?.allergies || "—"}</p>
      <p className="text-sm text-ink-soft">Medications: {s?.currentMedications || "—"}</p>
      <p className="micro mt-3">Requested items</p>
      <ul className="mt-1 flex flex-col gap-1 text-sm text-ink">
        {request.items.map((it, i) => (
          <li key={i}>{it.name} · {it.dosage} {it.unit}{it.areas.length ? ` · ${it.areas.join(", ")}` : ""}</li>
        ))}
      </ul>
      <div className="mt-4">
        <DecisionActions request={request} doctor={doctor} store={store} />
      </div>
    </aside>
  );
}

// Post-call wrap-up: decision stays actionable, plus a consult note. The note is a
// doctor-direct TREATMENT note — the only kind the backend rules let a prescribing doctor
// write on another owner's patient — so it unlocks once the request is approved.
function CallWrapUp({ request, doctor, store, onClose }: { request: AuthorisationRequest; doctor: Identity; store: Store; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const saveNote = () => {
    const body = note.trim();
    if (!body) return;
    store.saveTreatmentNote({ patientID: request.patientID, tickedIDs: [], title: "Consult call note", body, medications: [], identity: doctor });
    setNoteSaved(true);
  };
  return (
    <div className="mt-4 flex flex-col gap-4">
      <CallReviewPanel request={request} doctor={doctor} store={store} />
      <div className="rounded-inner border border-line p-4">
        {request.status !== "approved" ? (
          <p className="text-sm text-ink-soft">
            Approve the request to add a note to the patient file — reviewer access is read-only until approval.
          </p>
        ) : noteSaved ? (
          <p className="text-sm text-ink-soft" role="status">Note saved to the patient file.</p>
        ) : (
          <>
            <label htmlFor="post-call-note" className="micro">Post-call note</label>
            <textarea id="post-call-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Outcome of the consult…"
              className="mt-2 w-full rounded-inner border border-line bg-transparent p-3 text-sm text-ink" />
            <button onClick={saveNote} disabled={!note.trim()}
              className="mt-2 rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
              style={{ background: "var(--color-tint)" }}>
              Save note
            </button>
          </>
        )}
      </div>
      <div className="flex justify-center">
        <button onClick={onClose} className="rounded-btn border border-line px-6 py-2 text-sm text-ink hover:border-tint">
          Close
        </button>
      </div>
    </div>
  );
}

function CallOverlay({ call, onEnd }: { call: ActiveCall; onEnd: () => void }) {
  const store = useDemoStore();
  const { identity, availableIdentities } = useDemoAuth();
  const [connected, setConnected] = useState(false);
  const [remoteJoined, setRemoteJoined] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ended, setEnded] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);

  // The addressed doctor reviews + decides in-call (owner feature 2026-07-13). Resolved
  // from the HELD identities like the authorisations inbox, so prescribing stays always-on
  // even when a multi-role account is in a non-doctor workspace.
  const request = store.state.requests[call.requestID];
  const asDoctor = identity ? prescriberIdentity(heldIdentities(identity, availableIdentities)) : null;
  const reviewing = request && asDoctor && request.doctorID === asDoctor.user.id
    ? { request, doctor: asDoctor }
    : null;

  // Demo: simulate ring → in-call so the lifecycle is explorable without a transport.
  useEffect(() => {
    if (call.phase !== "demo") return;
    const t = setTimeout(() => setConnected(true), 1500);
    return () => clearTimeout(t);
  }, [call.phase]);

  // Live: join the LiveKit room, publish camera+mic, attach remote tracks as they arrive.
  // `ended` in the guard makes hang-up disconnect the room (effect cleanup) while the
  // wrap-up step keeps the overlay mounted.
  useEffect(() => {
    if (call.phase !== "live" || !call.token || ended) return;
    let room: Room | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const { Room: LKRoom, RoomEvent } = await import("livekit-client");
        const r = new LKRoom();
        room = r;
        await r.connect(LIVEKIT_URL, call.token as string);
        if (cancelled) { void r.disconnect(); return; }
        setConnected(true);

        const attach = () => {
          if (cancelled) return;
          // (Re)attach every current track: idempotent because attach() reuses elements.
          for (const p of r.remoteParticipants.values()) {
            for (const pub of p.trackPublications.values()) {
              const track = pub.track;
              if (!track) continue;
              const el = track.attach();
              const host = remoteRef.current;
              if (host && !host.contains(el)) {
                // Audio elements autoplay but must never render chrome over the video —
                // hide them explicitly rather than relying on browser default styling.
                if (track.kind === "video") el.className = "h-full w-full object-cover";
                else el.style.display = "none";
                host.appendChild(el);
              }
            }
          }
          setRemoteJoined(r.remoteParticipants.size > 0);
        };
        r.on(RoomEvent.TrackSubscribed, attach);
        r.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); });
        r.on(RoomEvent.ParticipantConnected, attach);
        r.on(RoomEvent.ParticipantDisconnected, () => setRemoteJoined(r.remoteParticipants.size > 0));
        attach();

        try {
          await r.localParticipant.enableCameraAndMicrophone();
          const camPub = r.localParticipant.getTrackPublications().find((p) => p.track?.kind === "video");
          const el = camPub?.track?.attach();
          if (el && localRef.current) { el.className = "h-full w-full object-cover"; localRef.current.appendChild(el); }
        } catch {
          // Camera/mic denied: stay in the room listen-only rather than failing the call.
          setMediaError("Camera or microphone unavailable — you're connected without them.");
        }
      } catch {
        if (!cancelled) setMediaError("Couldn't connect to the call. Please try again.");
      }
    })();
    return () => { cancelled = true; void room?.disconnect(); };
  }, [call.phase, call.token, ended]);

  // Call timer once connected (both modes); frozen at hang-up for the wrap-up header.
  useEffect(() => {
    if (!connected || ended) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [connected, ended]);

  const status = ended ? `Call ended · ${formatElapsed(elapsed)}`
    : call.phase === "error" ? (call.errorMessage ?? "Call failed.")
    : call.phase === "starting" ? "Starting…"
    : !connected ? "Connecting…"
    : call.phase === "live" && !remoteJoined ? "Ringing — waiting for the other party…"
    : `In call · ${formatElapsed(elapsed)}`;

  // Ending a reviewed call moves the doctor to the wrap-up step (decide + note) instead
  // of closing; everyone else (nurse, error state) closes immediately, as before.
  const endCall = () => {
    if (reviewing && call.phase !== "error") setEnded(true);
    else onEnd();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={call.title} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "color-mix(in srgb, var(--color-ink) 45%, transparent)" }}>
      <div className={`max-h-full w-full overflow-y-auto rounded-card border border-line bg-card p-5 shadow-card ${reviewing ? "max-w-4xl" : "max-w-2xl"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="micro">Consult call</p>
            <p className="font-display text-lg text-ink">{call.title}</p>
            <p className="text-sm text-ink-soft" role="status">{status}</p>
            {!ended && call.phase === "live" && call.delivered === 0 && !remoteJoined && (
              <p className="mt-1 text-sm" style={{ color: "var(--color-rose)" }}>
                Couldn&apos;t ring the other party — they may be offline.
              </p>
            )}
            {mediaError && <p className="mt-1 text-sm" style={{ color: "var(--color-rose)" }}>{mediaError}</p>}
          </div>
        </div>

        {ended && reviewing ? (
          <CallWrapUp request={reviewing.request} doctor={reviewing.doctor} store={store} onClose={onEnd} />
        ) : (
          <>
            <div className={reviewing ? "mt-4 grid gap-4 md:grid-cols-[3fr_2fr]" : "mt-4"}>
              <div className="relative aspect-video overflow-hidden rounded-inner border border-line" style={{ background: "var(--color-ink)" }}>
                <div ref={remoteRef} className="h-full w-full" />
                {call.phase === "demo" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-medium text-card" style={{ background: "var(--color-tint)" }} aria-hidden>
                      {call.title.replace("Consult · ", "").slice(0, 1) || "C"}
                    </span>
                    <p className="text-sm text-card">{connected ? "In call (simulated)" : "Ringing…"}</p>
                    <p className="micro max-w-xs" style={{ color: "var(--color-line)" }}>
                      Demo mode — live video connects on the live backend.
                    </p>
                  </div>
                )}
                {call.phase === "live" && !remoteJoined && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-sm text-card">Waiting for the other party to join…</p>
                  </div>
                )}
                <div ref={localRef} className="absolute bottom-3 right-3 h-24 w-32 overflow-hidden rounded-inner border border-line" style={{ background: "color-mix(in srgb, var(--color-ink) 80%, var(--color-card))" }} aria-label="Your camera" />
              </div>
              {reviewing && <CallReviewPanel request={reviewing.request} doctor={reviewing.doctor} store={store} />}
            </div>

            <div className="mt-4 flex justify-center">
              <button onClick={endCall} className="rounded-btn px-6 py-2 text-sm font-medium text-card" style={{ background: "var(--color-rose)" }}>
                {call.phase === "error" ? "Close" : "End call"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
