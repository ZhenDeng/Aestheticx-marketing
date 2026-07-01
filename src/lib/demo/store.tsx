"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DemoState, Identity, MedicationItem, TreatmentMedication } from "./types";
import { buildSeedState, SEED_NOW } from "./seed";
import * as backend from "./backend";
import * as billing from "./billing";
import * as invoicing from "./invoicing";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { useDemoAuth } from "./auth";

type Status = "demo" | "loading" | "ready" | "error";

interface StoreValue {
  state: DemoState;
  now: number;
  status: Status;
  lastSyncError: string | null;
  rehydrate: () => void;
  searchPatients: (query: string, identity: Identity) => ReturnType<typeof backend.searchPatients>;
  notesForPatient: (patientID: string) => ReturnType<typeof backend.notesForPatient>;
  activeAuthorisations: (patientID: string) => ReturnType<typeof backend.activeAuthorisations>;
  pendingRequestsForDoctor: (doctorID: string) => ReturnType<typeof backend.pendingRequestsForDoctor>;
  openRequestsForPatient: (patientID: string, nurseID: string) => ReturnType<typeof backend.openRequestsForPatient>;
  submitRequest: (input: { patientID: string; doctorID: string; items: MedicationItem[]; identity: Identity }) => void;
  approveRequest: (requestID: string, identity: Identity) => void;
  requireEdit: (requestID: string, identity: Identity) => void;
  saveGeneralNote: (input: { patientID: string; title: string; body: string; identity: Identity }) => void;
  saveTreatmentNote: (input: { patientID: string; tickedIDs: string[]; title: string; body: string; medications: TreatmentMedication[]; identity: Identity }) => void;
  sendAftercare: (input: { patientID: string; content: string; medications: TreatmentMedication[]; categories: import("./aftercare").AftercareCategory[]; identity: Identity }) => void;
  retryAftercare: (patientID: string, noteID: string, identity: Identity) => void;
  noteTemplatesForOwner: (ownerID: string) => ReturnType<typeof backend.noteTemplatesForOwner>;
  saveNoteTemplate: (template: import("./types").NoteTemplate, identity: Identity) => void;
  deleteNoteTemplate: (id: string, identity: Identity) => void;
  followUpSettingsForUser: (userID: string) => ReturnType<typeof backend.followUpSettingsForUser>;
  followUpTasksForOwnerOn: (ownerID: string, dateISO: string) => ReturnType<typeof backend.followUpTasksForOwnerOn>;
  setFollowUpSettings: (settings: import("./types").FollowUpSettings, identity: Identity) => void;
  setFollowUpStatus: (id: string, status: import("./types").FollowUpStatus, identity: Identity) => void;
  bookingTokenForUser: (userID: string) => ReturnType<typeof backend.bookingTokenForUser>;
  pendingBookings: (ownerID: string) => ReturnType<typeof backend.pendingBookings>;
  ensureBookingToken: (identity: Identity) => void;
  confirmAppointment: (id: string, identity: Identity) => void;
  appointmentsForOwnerOnDay: (ownerID: string, dateISO: string) => ReturnType<typeof backend.appointmentsForOwnerOnDay>;
  appointmentsForOwnerInRange: (ownerID: string, startISO: string, endISO: string) => ReturnType<typeof backend.appointmentsForOwnerInRange>;
  appointmentsForPatient: (patientID: string) => ReturnType<typeof backend.appointmentsForPatient>;
  availabilityWindowsForDoctor: (doctorID: string) => ReturnType<typeof backend.availabilityWindowsForDoctor>;
  doctorsWithAvailability: () => ReturnType<typeof backend.doctorsWithAvailability>;
  treatmentAvailabilityForOwner: (ownerID: string) => import("./backend").TreatmentAvailabilityResult;
  setTreatmentDaySchedule: (ownerID: string, weekday: number, patch: Partial<import("./types").DaySchedule>) => void;
  addTreatmentBlock: (ownerID: string, input: { dateISO: string; startMinute: number; endMinute: number }) => void;
  removeTreatmentBlock: (ownerID: string, blockID: string) => void;
  openSlotsForDoctorOnDay: (doctorID: string, dateISO: string) => ReturnType<typeof backend.openSlotsForDoctorOnDay>;
  // Nurse-facing reads: demo resolves from local state; live calls the backend (nurse has no local windows).
  listAvailableDoctors: () => Promise<{ doctorID: string; doctorName: string }[]>;
  listDoctorOpenSlots: (doctorID: string, dateISO: string) => Promise<number[]>;
  publishAvailability: (input: import("./backend").PublishAvailabilityInput, identity: Identity) => void;
  withdrawAvailability: (windowID: string, identity: Identity) => void;
  bookAuthSlot: (input: import("./backend").BookAuthSlotInput) => Promise<void>;
  bookTreatmentAppointment: (input: import("./backend").BookTreatmentInput) => void;
  rescheduleAppointment: (id: string, dateISO: string, startMinute: number, durationMinutes: number, identity: Identity) => void;
  markAppointment: (id: string, status: "completed" | "noShow" | "cancelled", identity: Identity) => void;
  linkAppointmentPatient: (apptId: string, patientId: string, identity: Identity) => void;
  createPatient: (draft: import("./types").PatientDraft, identity: Identity) => string;
  updatePatient: (patient: import("./types").Patient, identity: Identity) => void;
  deletePatient: (id: string, identity: Identity) => void;
  mergePatients: (keepId: string, removeId: string, identity: Identity) => void;
  formsForPatient: (patientID: string) => ReturnType<typeof backend.formsForPatient>;
  billingSummary: (identity: Identity) => ReturnType<typeof billing.billingSummary>;
  invoicesFor: (identity: Identity) => ReturnType<typeof invoicing.invoicesFor>;
  scriptPrice: (doctorID: string, counterpartyID: string) => number;
  billableAuthorisations: (doctorID: string) => ReturnType<typeof backend.billableAuthorisations>;
  setScriptPrice: (counterpartyID: string, priceCents: number, identity: Identity) => void;
  generateInvoice: (input: import("./backend").GenerateInvoiceInput, identity: Identity) => void;
  recordForm: (input: import("./backend").RecordFormInput, identity: Identity) => void;
  deleteForm: (patientID: string, formId: string, identity: Identity) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function clinicMap(identity: Identity): Record<string, string> {
  return identity.context.kind === "clinic"
    ? { [identity.context.clinic.id]: identity.role === "clinicAdmin" ? "admin" : "employee" }
    : {};
}

function clinicId(identity: Identity): string | null {
  return identity.context.kind === "clinic" ? identity.context.clinic.id : null;
}

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const live = isFirebaseConfigured();
  const { identity, availableIdentities } = useDemoAuth();
  const [state, setState] = useState<DemoState>(() => (live ? backend.emptyState() : buildSeedState()));
  const [status, setStatus] = useState<Status>(live ? "loading" : "demo");
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  // Captured once per provider mount (live: session start; demo: fixed SEED_NOW).
  // Lazy initializer keeps the impure Date.now() out of the render path.
  const [now] = useState(() => (live ? Date.now() : SEED_NOW));

  // Live hydrate whenever the signed-in user changes or a refresh is requested.
  useEffect(() => {
    if (!live || !identity) return;
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        const { hydrate } = await import("@/lib/firebase/hydrate");
        // Hydrate across ALL of the user's identities (roles + clinics), not just the
        // selected one, so a multi-clinic user sees their full visible data set.
        const ids = availableIdentities.length ? availableIdentities : [identity];
        const allClinics = Object.assign({}, ...ids.map(clinicMap));
        const allRoles = [...new Set(ids.map((i) => i.role))];
        const next = await hydrate({ uid: identity.user.id, roles: allRoles, clinics: allClinics });
        if (!cancelled) { setState(next); setStatus("ready"); }
      } catch (e) {
        if (!cancelled) { setStatus("error"); setLastSyncError(String(e)); }
      }
    })();
    return () => { cancelled = true; };
  }, [live, identity, availableIdentities, refreshTick]);

  // Optimistic local apply, then mirror to Firestore/Functions (live only).
  const applyAndMirror = useCallback(
    (
      apply: (s: DemoState) => DemoState,
      mirror: (m: typeof import("@/lib/firebase/mirror")) => Promise<void>,
    ) => {
      setState((s) => apply(s));
      if (!live) return;
      void (async () => {
        try {
          const m = await import("@/lib/firebase/mirror");
          await mirror(m);
        } catch (e) {
          // The optimistic local apply was never persisted. Surface the banner and
          // rehydrate so the UI reconciles back to Firestore truth rather than
          // showing phantom data until the next manual refresh.
          setLastSyncError(String(e));
          setRefreshTick((t) => t + 1);
        }
      })();
    },
    [live],
  );

  const value = useMemo<StoreValue>(
    () => ({
      state,
      now,
      status,
      lastSyncError,
      rehydrate: () => setRefreshTick((t) => t + 1),
      searchPatients: (q, id) => backend.searchPatients(state, q, id),
      notesForPatient: (pid) => backend.notesForPatient(state, pid),
      activeAuthorisations: (pid) => backend.activeAuthorisations(state, pid, now),
      billingSummary: (id) => billing.billingSummary(Object.values(state.authorisations), id),
      invoicesFor: (id) => invoicing.invoicesFor(state.invoices, id),
      scriptPrice: (did, cid) => state.scriptPricing[backend.scriptPriceKey(did, cid)] ?? invoicing.DEFAULT_SCRIPT_PRICE_CENTS,
      billableAuthorisations: (did) => backend.billableAuthorisations(state, did),
      setScriptPrice: (cid, priceCents, id) => {
        if (!live) { setState((s) => backend.setScriptPrice(s, id.user.id, cid, priceCents)); return; }
        void (async () => {
          try { const m = await import("@/lib/firebase/invoices"); await m.setScriptPrice(cid, priceCents); setRefreshTick((t) => t + 1); }
          catch (e) { setLastSyncError(String(e)); }
        })();
      },
      generateInvoice: (input, id) => {
        if (!live) { setState((s) => backend.generateInvoice(s, input, id, now).state); return; }
        void (async () => {
          try {
            const m = await import("@/lib/firebase/invoices");
            await m.generateInvoice({ counterpartyID: input.counterpartyID, counterpartyType: input.counterpartyType, periodLabel: input.periodLabel, authorisationIDs: input.authIDs });
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(String(e)); }
        })();
      },
      pendingRequestsForDoctor: (did) => backend.pendingRequestsForDoctor(state, did),
      openRequestsForPatient: (pid, nid) => backend.openRequestsForPatient(state, pid, nid),
      submitRequest: (input) => {
        // Mint the id eagerly (outside the updater) so the local copy and the mirrored
        // doc share one id. A functional setState updater re-runs under React Strict Mode,
        // which would otherwise generate a second id inside the updater and diverge from
        // the value captured here for the mirror. See createPatient for the same pattern.
        const { state: next, request } = backend.submitRequest(state, input, now);
        applyAndMirror(() => next, (m) => m.mirrorCreateRequest(request));
      },
      approveRequest: (requestID, id) =>
        applyAndMirror((s) => backend.approveRequest(s, requestID, id, now).state, (m) => m.mirrorApproveRequest(requestID)),
      requireEdit: (requestID, id) =>
        applyAndMirror((s) => backend.requireEdit(s, requestID, id), (m) => m.mirrorRequireEdit(requestID)),
      saveGeneralNote: (input) => {
        // Mint the note id eagerly so the local copy and the mirrored doc agree (Strict
        // Mode re-runs the updater — see createPatient / submitRequest).
        const { state: next, note } = backend.saveGeneralNote(state, input, now);
        applyAndMirror(() => next, (m) => m.mirrorCreateNote(input.patientID, note));
      },
      saveTreatmentNote: (input) => {
        // Mint the note + follow-up ids eagerly so the local copies and the mirrored docs
        // share one id each. Inside the Strict-Mode-double-invoked updater they would
        // diverge, leaving the follow-up's sourceNoteID pointing at a phantom note id.
        const { state: next, note, followUp } = backend.saveTreatmentNote(state, input, now);
        applyAndMirror(
          () => next,
          async (m) => {
            if (input.tickedIDs.length) {
              await m.mirrorConsumeRepeats({
                patientId: input.patientID,
                clinicId: clinicId(input.identity),
                authorisationIds: input.tickedIDs,
                note: { title: input.title, body: input.body, medications: input.medications },
              });
            } else {
              await m.mirrorCreateNote(input.patientID, note);
            }
            // followUp.sourceNoteID points at the client note id. In the doctor-direct
            // path that matches the mirrored note; in the ticked path the consumeRepeats
            // Function writes a server-id note, so sourceNoteID is a best-effort hint there
            // (unread by the app — same as iOS, which shares this Function).
            if (followUp) await m.mirrorSaveFollowUpTask(followUp);
          },
        );
      },
      sendAftercare: (input) => {
        // Demo records the aftercareRecord note locally. Live calls the deployed
        // sendAftercare callable — it queues the email AND writes the note server-side,
        // so we must NOT also write locally here; rehydrate to pull the new note.
        if (!live) {
          setState((s) => backend.recordAftercareSend(s, input, now).state);
          return;
        }
        void (async () => {
          try {
            const m = await import("@/lib/firebase/mirror");
            await m.mirrorSendAftercare({
              patientID: input.patientID, content: input.content, medications: input.medications,
            });
            setRefreshTick((t) => t + 1);
          } catch (e) {
            setLastSyncError(String(e));
          }
        })();
      },
      retryAftercare: (patientID, noteID, identity) => {
        // Demo: a successful re-attempt flips the record to delivered. Live retry is a
        // deferred backend task (the Retry button is demo-gated), so this is demo-only.
        if (!live) {
          setState((s) => backend.setNoteDeliveryStatus(s, patientID, noteID, "delivered", identity));
        }
      },
      noteTemplatesForOwner: (ownerID) => backend.noteTemplatesForOwner(state, ownerID),
      saveNoteTemplate: (template, identity) =>
        applyAndMirror(
          (s) => backend.saveNoteTemplate(s, template, identity),
          (m) => m.mirrorSaveNoteTemplate(template),
        ),
      deleteNoteTemplate: (id, identity) =>
        applyAndMirror(
          (s) => backend.deleteNoteTemplate(s, id, identity),
          (m) => m.mirrorDeleteNoteTemplate(identity.user.id, id),
        ),
      followUpSettingsForUser: (userID) => backend.followUpSettingsForUser(state, userID),
      followUpTasksForOwnerOn: (ownerID, dateISO) => backend.followUpTasksForOwnerOn(state, ownerID, dateISO),
      setFollowUpSettings: (settings, identity) =>
        applyAndMirror(
          (s) => backend.setFollowUpSettings(s, settings, identity),
          (m) => m.mirrorSetFollowUpSettings(identity.user.id, settings),
        ),
      setFollowUpStatus: (id, status, identity) =>
        applyAndMirror(
          (s) => backend.setFollowUpStatus(s, id, status, identity),
          (m) => m.mirrorSetFollowUpStatus(identity.user.id, id, status),
        ),
      bookingTokenForUser: (userID) => backend.bookingTokenForUser(state, userID),
      pendingBookings: (ownerID) => backend.pendingBookings(state, ownerID),
      ensureBookingToken: (identity) => {
        if (state.bookingTokensByUser[identity.user.id]) return; // already have one
        let token = "";
        applyAndMirror(
          (s) => { const r = backend.mintBookingToken(s, identity); token = r.token; return r.state; },
          (m) => token ? m.mirrorSetBookingToken(identity.user.id, token) : Promise.resolve(),
        );
      },
      confirmAppointment: (id, identity) =>
        applyAndMirror(
          (s) => backend.confirmAppointment(s, id, identity),
          (m) => m.mirrorConfirmAppointment(id),
        ),
      appointmentsForOwnerOnDay: (ownerID, dateISO) => backend.appointmentsForOwnerOnDay(state, ownerID, dateISO),
      appointmentsForOwnerInRange: (ownerID, startISO, endISO) => backend.appointmentsForOwnerInRange(state, ownerID, startISO, endISO),
      appointmentsForPatient: (patientID) => backend.appointmentsForPatient(state, patientID),
      availabilityWindowsForDoctor: (doctorID) => backend.availabilityWindowsForDoctor(state, doctorID),
      doctorsWithAvailability: () => backend.doctorsWithAvailability(state),
      treatmentAvailabilityForOwner: (ownerID) => backend.treatmentAvailabilityForOwner(state, ownerID),
      // Config edits mirror the WHOLE availability config to the backend setTreatmentAvailability
      // callable (the web has no granular callables). Compute eagerly to validate (throw
      // synchronously) + capture the config for the mirror; apply via a functional updater.
      setTreatmentDaySchedule: (ownerID, weekday, patch) => {
        const config = backend.treatmentAvailabilityForOwner(
          backend.setTreatmentDaySchedule(state, ownerID, weekday, patch), ownerID,
        );
        applyAndMirror(
          (s) => backend.setTreatmentDaySchedule(s, ownerID, weekday, patch),
          (m) => m.mirrorSetTreatmentAvailability(config),
        );
      },
      addTreatmentBlock: (ownerID, input) => {
        const { state: applied, block } = backend.addTreatmentBlock(state, ownerID, input); // validate + mint id
        const config = backend.treatmentAvailabilityForOwner(applied, ownerID);
        applyAndMirror(
          (s) => {
            const c = backend.treatmentAvailabilityForOwner(s, ownerID);
            const next = { ...c, ownerID, blocks: [...c.blocks, block] };
            return { ...s, treatmentAvailabilityByOwner: { ...s.treatmentAvailabilityByOwner, [ownerID]: next } };
          },
          (m) => m.mirrorSetTreatmentAvailability(config),
        );
      },
      removeTreatmentBlock: (ownerID, blockID) => {
        const config = backend.treatmentAvailabilityForOwner(
          backend.removeTreatmentBlock(state, ownerID, blockID), ownerID,
        );
        applyAndMirror(
          (s) => backend.removeTreatmentBlock(s, ownerID, blockID),
          (m) => m.mirrorSetTreatmentAvailability(config),
        );
      },
      openSlotsForDoctorOnDay: (doctorID, dateISO) => backend.openSlotsForDoctorOnDay(state, doctorID, dateISO),
      listAvailableDoctors: async () => {
        if (!live) return backend.doctorsWithAvailability(state);
        const m = await import("@/lib/firebase/mirror");
        return m.mirrorListAvailableDoctors();
      },
      listDoctorOpenSlots: async (doctorID, dateISO) => {
        if (!live) return backend.openSlotsForDoctorOnDay(state, doctorID, dateISO);
        const m = await import("@/lib/firebase/mirror");
        return m.mirrorListDoctorOpenSlots(doctorID, dateISO);
      },
      bookTreatmentAppointment: (input) => {
        backend.bookTreatmentAppointment(state, input); // eager validate — throws synchronously (result discarded)
        setState((s) => backend.bookTreatmentAppointment(s, input).state); // apply against latest state
        if (!live) return;
        void (async () => {
          try {
            const m = await import("@/lib/firebase/mirror");
            await m.mirrorBookTreatment({
              ownerID: input.identity.context.kind === "clinic" ? input.identity.context.clinic.id : input.identity.user.id,
              dateISO: input.dateISO, startMinute: input.startMinute, durationMinutes: input.durationMinutes,
              patientID: input.patientID, patientName: input.patientName, note: input.note,
            });
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(String(e)); }
        })();
      },
      rescheduleAppointment: (id, dateISO, startMinute, durationMinutes, identity) => {
        backend.rescheduleAppointment(state, id, dateISO, startMinute, durationMinutes, identity); // eager validate — throws
        applyAndMirror(
          (s) => backend.rescheduleAppointment(s, id, dateISO, startMinute, durationMinutes, identity),
          (m) => m.mirrorRescheduleAppointment(id, dateISO, startMinute, durationMinutes),
        );
      },
      markAppointment: (id, status, identity) =>
        applyAndMirror(
          (s) => backend.markAppointment(s, id, status, identity),
          (m) => m.mirrorMarkAppointment(id, status),
        ),
      linkAppointmentPatient: (apptId, patientId, identity) =>
        applyAndMirror(
          (s) => backend.linkAppointmentPatient(s, apptId, patientId, identity),
          (m) => m.mirrorLinkAppointmentPatient(apptId, patientId),
        ),
      publishAvailability: (input, identity) => {
        // Validate + mint the window once (eagerly) so Strict-Mode double-invoke can't mint two.
        const { window } = backend.publishAvailability(state, input, identity);
        applyAndMirror(
          (s) => ({ ...s, availabilityWindows: { ...s.availabilityWindows, [window.id]: window } }),
          (m) => m.mirrorPublishAvailability(window),
        );
      },
      withdrawAvailability: (windowID, identity) => {
        // Validate eagerly so the BackendError surfaces to the caller; the updater then does a
        // pure immutable key-removal (re-running backend.withdraw inside setState could throw
        // mid-render if state shifted). The delete is on a fresh shallow copy, never on state.
        backend.withdrawAvailability(state, windowID, identity);
        const w = state.availabilityWindows[windowID]!; // validated to exist above
        applyAndMirror(
          (s) => { const next = { ...s.availabilityWindows }; delete next[windowID]; return { ...s, availabilityWindows: next }; },
          (m) => m.mirrorWithdrawAvailability(w.dateISO, w.startMinute),
        );
      },
      bookAuthSlot: async (input) => {
        if (!live) {
          // Demo: validate against local windows (throws slotTaken) + mint the appointment.
          const { appt } = backend.bookAuthSlot(state, input);
          setState((s) => ({ ...s, appointments: { ...s.appointments, [appt.id]: appt } }));
          return;
        }
        // Live: the nurse has no local windows — the server is authoritative (validates the slot,
        // mints the appointment, and rejects a double-book). The page refetches open slots after.
        const m = await import("@/lib/firebase/mirror");
        await m.mirrorBookAuthSlot({
          doctorID: input.doctorID, dateISO: input.dateISO, slotMinute: input.startMinute,
          patientID: input.patientID, counterpartyName: input.identity.user.name,
        });
      },
      createPatient: (draft, identity) => {
        // Compute the patient eagerly so we can return its id synchronously (the page
        // navigates to it) and surface validation/permission throws to the caller. The
        // new patient is independent of existing records, so this is never "stale" — but
        // we apply it through a functional setState so the patients-map spread always
        // merges into the freshest state rather than a stale closure snapshot.
        const { patient } = backend.createPatient(state, draft, identity);
        setState((s) => ({ ...s, patients: { ...s.patients, [patient.id]: patient } }));
        if (live) {
          void (async () => {
            try { const m = await import("@/lib/firebase/mirror"); await m.mirrorCreatePatient(patient); }
            catch (e) { setLastSyncError(String(e)); setRefreshTick((t) => t + 1); }
          })();
        }
        return patient.id;
      },
      updatePatient: (patient, identity) =>
        applyAndMirror((s) => backend.updatePatient(s, patient, identity), (m) => m.mirrorUpdatePatient(patient)),
      deletePatient: (id, identity) =>
        applyAndMirror((s) => backend.deletePatient(s, id, identity), (m) => m.mirrorDeletePatient(id)),
      mergePatients: (keepId, removeId, identity) =>
        applyAndMirror((s) => backend.mergePatients(s, keepId, removeId, identity), (m) => m.mirrorMergePatients(keepId, removeId)),
      formsForPatient: (pid) => backend.formsForPatient(state, pid),
      recordForm: (input, identity) => {
        // Mint the form id eagerly so the local copy and the mirrored doc agree (Strict
        // Mode re-runs the updater — see createPatient / submitRequest).
        const { state: next, form } = backend.recordSignedForm(state, input, identity, now);
        applyAndMirror(() => next, (m) => m.mirrorCreateForm(form));
      },
      deleteForm: (patientID, formId, identity) =>
        applyAndMirror((s) => backend.deleteForm(s, patientID, formId, identity), (m) => m.mirrorDeleteForm(patientID, formId)),
    }),
    [state, now, status, lastSyncError, applyAndMirror, live],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDemoStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDemoStore must be used within DemoStoreProvider");
  return ctx;
}
