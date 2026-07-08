"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppointmentLead, DemoState, Identity, MedicationItem, TreatmentMedication } from "./types";
import { buildSeedState, SEED_NOW } from "./seed";
import * as backend from "./backend";
import * as billing from "./billing";
import * as invoicing from "./invoicing";
import * as emergency from "./emergency";
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
  matchLeadToPatients: (lead: AppointmentLead, identity: Identity) => ReturnType<typeof backend.matchLeadToPatients>;
  notesForPatient: (patientID: string) => ReturnType<typeof backend.notesForPatient>;
  visibleNotesForPatient: (patientID: string, identity: Identity) => ReturnType<typeof backend.visibleNotesForPatient>;
  activeAuthorisations: (patientID: string) => ReturnType<typeof backend.activeAuthorisations>;
  activeEmergencyAuthorisations: (patientID: string) => ReturnType<typeof emergency.activeEmergencyAuthorisationsForPatient>;
  pendingRequestsForDoctor: (doctorID: string) => ReturnType<typeof backend.pendingRequestsForDoctor>;
  openRequestsForPatient: (patientID: string, nurseID: string) => ReturnType<typeof backend.openRequestsForPatient>;
  submitRequest: (input: { patientID: string; doctorID: string; items: MedicationItem[]; identity: Identity }) => void;
  approveRequest: (requestID: string, identity: Identity) => void;
  requireEdit: (requestID: string, identity: Identity) => void;
  resubmitRequest: (input: { requestID: string; items: MedicationItem[]; identity: Identity }) => void;
  withdrawRequest: (requestID: string, identity: Identity) => void;
  saveGeneralNote: (input: backend.SaveGeneralNoteInput) => void;
  saveTreatmentNote: (input: backend.SaveTreatmentNoteInput) => void;
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
  doctorStatusForUser: (doctorID: string) => import("./backend").DoctorStatusResult;
  setDoctorStatus: (doctorID: string, patch: Partial<import("./types").DoctorStatus>) => void;
  mostRecentlyCalledDoctor: (userID: string) => string | null;
  // Starts a consult on an authorisation request: records the request's doctor as
  // most-recently-called (demo + live), then live rings the other party and mints the
  // LiveKit join token. Demo has no transport — the caller simulates the call locally.
  startConsult: (requestID: string, identity: Identity) =>
    Promise<{ mode: "demo" } | { mode: "live"; room: string; token: string; delivered: number }>;
  googleCalendarAuthUrl: () => Promise<string>;
  syncGoogleCalendar: (timeZone: string, ownerID: string) => Promise<{ busyCount: number; mirrored: number }>;
  openSlotsForDoctorOnDay: (doctorID: string, dateISO: string) => ReturnType<typeof backend.openSlotsForDoctorOnDay>;
  // Nurse-facing reads: demo resolves from local state; live calls the backend (nurse has no local windows).
  listAvailableDoctors: () => Promise<{ doctorID: string; doctorName: string; hasSlots: boolean; online: boolean; alwaysAcceptAuth: boolean }[]>;
  // The full prescribing-doctor directory for the auth-request picker (live: listDoctors
  // callable; demo: the DEMO_ACCOUNTS doctors).
  listDoctors: () => Promise<{ doctorId: string; doctorName: string }[]>;
  // Cooperation-relationship gate (spec 2026-07-08): the doctors the acting nurse/clinic may
  // request from — a sync selector over hydrated state (works in demo + live).
  cooperatingDoctors: (identity: Identity) => ReturnType<typeof backend.cooperatingDoctors>;
  cooperationRelationships: () => ReturnType<typeof backend.cooperationRelationshipsList>;
  relationshipAuditFor: (relationshipID: string) => ReturnType<typeof backend.relationshipAuditForRelationship>;
  setCooperationRelationship: (input: import("./backend").SetCooperationRelationshipInput, actor: Identity) => void;
  removeCooperationRelationship: (relationshipID: string, actor: Identity) => void;
  listDoctorOpenSlots: (doctorID: string, dateISO: string) => Promise<number[]>;
  publishAvailability: (input: import("./backend").PublishAvailabilityInput, identity: Identity) => void;
  withdrawAvailability: (windowID: string, identity: Identity) => void;
  bookAuthSlot: (input: import("./backend").BookAuthSlotInput) => Promise<void>;
  requestAdHocAuth: (input: import("./backend").RequestAdHocAuthInput) => Promise<void>;
  bookTreatmentAppointment: (input: import("./backend").BookTreatmentInput) => void;
  rescheduleAppointment: (id: string, dateISO: string, startMinute: number, durationMinutes: number, identity: Identity) => void;
  markAppointment: (id: string, status: "completed" | "noShow" | "cancelled", identity: Identity) => void;
  linkAppointmentPatient: (apptId: string, patientId: string, identity: Identity) => void;
  createPatient: (draft: import("./types").PatientDraft, identity: Identity) => string;
  updatePatient: (patient: import("./types").Patient, identity: Identity) => void;
  setPatientAvatar: (patientID: string, avatar: backend.PatientAvatarEdit, identity: Identity) => void;
  deletePatient: (id: string, identity: Identity) => void;
  mergePatients: (keepId: string, removeId: string, identity: Identity) => void;
  formsForPatient: (patientID: string) => ReturnType<typeof backend.formsForPatient>;
  billingSummary: (identity: Identity) => ReturnType<typeof billing.billingSummary>;
  customTimeframeCount: (identity: Identity, fromMillis: number, toMillis: number) => number;
  clinicBusinessStats: (identity: Identity, fromMillis: number, toMillis: number) => ReturnType<typeof billing.clinicBusinessStats>;
  invoicesFor: (identity: Identity) => ReturnType<typeof invoicing.invoicesFor>;
  scriptPrice: (doctorID: string, counterpartyID: string) => number;
  billableAuthorisations: (doctorID: string) => ReturnType<typeof backend.billableAuthorisations>;
  setScriptPrice: (counterpartyID: string, priceCents: number, identity: Identity) => void;
  generateInvoice: (input: import("./backend").GenerateInvoiceInput, identity: Identity) => void;
  recordForm: (input: import("./backend").RecordFormInput, identity: Identity) => void;
  deleteForm: (patientID: string, formId: string, identity: Identity) => void;
  profileForUser: (userID: string) => ReturnType<typeof backend.profileForUser>;
  updateProfile: (edits: import("./types").UserProfileEdit, identity: Identity) => void;
  // Per-identity address (owner feedback #2). Demo-local: no live mirror yet — the resolver
  // falls back to the per-user address in live mode, and overrides are session-only there.
  addressForIdentity: (identity: Identity) => string;
  setAddressForIdentity: (identity: Identity, address: string) => void;
  // Super-admin console. accounts() lists the hydrated inventory (demo: the demo cast;
  // live: every users/{uid} doc). createUser/resetUserPassword are live-only — the
  // deployed callables are the only way to touch Auth records, so demo rejects.
  accounts: () => ReturnType<typeof backend.accountsInventory>;
  createUser: (input: import("./userAdmin").NewUserInput) => Promise<void>;
  resetUserPassword: (email: string) => Promise<void>;
  deleteUserAccount: (uid: string) => Promise<void>;
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
      matchLeadToPatients: (lead, id) => backend.matchLeadToPatients(state, lead, id),
      notesForPatient: (pid) => backend.notesForPatient(state, pid),
      visibleNotesForPatient: (pid, id) => backend.visibleNotesForPatient(state, pid, id),
      activeAuthorisations: (pid) => backend.activeAuthorisations(state, pid, now),
      activeEmergencyAuthorisations: (pid) => emergency.activeEmergencyAuthorisationsForPatient(state, pid, now),
      billingSummary: (id) => billing.billingSummary(Object.values(state.authorisations), id),
      customTimeframeCount: (id, fromMillis, toMillis) => billing.customTimeframeCount(Object.values(state.authorisations), id, fromMillis, toMillis),
      clinicBusinessStats: (id, fromMillis, toMillis) => billing.clinicBusinessStats(Object.values(state.authorisations), state.usages, id, fromMillis, toMillis),
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
        // generateEmergency: !live — in live mode the backend Cloud Function writes the emergency
        // records and hydrate reads them; the optimistic client must not fabricate a phantom one.
        applyAndMirror((s) => backend.approveRequest(s, requestID, id, now, { generateEmergency: !live }).state, (m) => m.mirrorApproveRequest(requestID)),
      requireEdit: (requestID, id) =>
        applyAndMirror((s) => backend.requireEdit(s, requestID, id), (m) => m.mirrorRequireEdit(requestID)),
      resubmitRequest: (input) =>
        applyAndMirror(
          (s) => backend.resubmitRequest(s, input),
          (m) => m.mirrorResubmitRequest(input.requestID, input.items),
        ),
      withdrawRequest: (requestID, id) =>
        applyAndMirror((s) => backend.withdrawRequest(s, requestID, id), (m) => m.mirrorWithdrawRequest(requestID)),
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
                note: { title: input.title, body: input.body, medications: input.medications, attachments: input.attachments },
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
      confirmAppointment: (id, identity) => {
        backend.confirmAppointment(state, id, identity); // eager validate — throws synchronously (e.g. already actioned)
        applyAndMirror(
          (s) => backend.confirmAppointment(s, id, identity),
          (m) => m.mirrorConfirmAppointment(id),
        );
      },
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
      doctorStatusForUser: (doctorID) => backend.doctorStatusForUser(state, doctorID),
      setDoctorStatus: (doctorID, patch) => {
        const merged = backend.doctorStatusForUser(backend.setDoctorStatus(state, doctorID, patch), doctorID);
        applyAndMirror(
          (s) => backend.setDoctorStatus(s, doctorID, patch),
          (m) => m.mirrorSetOnlineStatus(merged),
        );
      },
      mostRecentlyCalledDoctor: (userID) => backend.mostRecentlyCalledDoctor(state, userID),
      startConsult: async (requestID, identity) => {
        // iOS parity (CallCenter.startConsult): record the REQUEST's doctor for the active
        // user whenever a consult starts, before the transport does anything.
        const doctorID = state.requests[requestID]?.doctorID;
        if (doctorID) {
          applyAndMirror(
            (s) => backend.recordCalledDoctor(s, identity.user.id, doctorID),
            (m) => m.mirrorRecordCalledDoctor(identity.user.id, doctorID),
          );
        }
        if (!live) return { mode: "demo" as const };
        const m = await import("@/lib/firebase/mirror");
        const { room, delivered } = await m.mirrorStartConsultCall(requestID);
        const { token } = await m.mirrorMintCallToken(requestID);
        return { mode: "live" as const, room, token, delivered };
      },
      // Google Calendar link + two-way sync (deployed callables). Demo simulates: the seed
      // already carries busy events, so a demo "sync" just reports what's there.
      googleCalendarAuthUrl: async () => {
        if (!live) return ""; // demo: no OAuth — the card explains instead
        const m = await import("@/lib/firebase/mirror");
        return m.mirrorGoogleCalendarAuthUrl();
      },
      syncGoogleCalendar: async (timeZone, ownerID) => {
        if (!live) {
          const cal = state.externalBusyByOwner[ownerID];
          return { busyCount: cal?.events.length ?? 0, mirrored: 0 };
        }
        const m = await import("@/lib/firebase/mirror");
        const result = await m.mirrorSyncGoogleCalendar(timeZone);
        setRefreshTick((t) => t + 1); // pull the fresh externalBusy doc into state
        return result;
      },
      openSlotsForDoctorOnDay: (doctorID, dateISO) => backend.openSlotsForDoctorOnDay(state, doctorID, dateISO),
      listAvailableDoctors: async () => {
        if (!live) return backend.doctorsWithAvailability(state);
        const m = await import("@/lib/firebase/mirror");
        return m.mirrorListAvailableDoctors();
      },
      listDoctors: async () => {
        if (!live) { const { demoDoctorRefs } = await import("./accounts"); return demoDoctorRefs(); }
        const m = await import("@/lib/firebase/mirror");
        return m.mirrorListDoctors();
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
              patientID: input.patientID, patientName: input.patientName, lead: input.lead, note: input.note,
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
      markAppointment: (id, status, identity) => {
        backend.markAppointment(state, id, status, identity); // eager validate — throws synchronously (e.g. already actioned)
        applyAndMirror(
          (s) => backend.markAppointment(s, id, status, identity),
          (m) => m.mirrorMarkAppointment(id, status),
        );
      },
      linkAppointmentPatient: (apptId, patientId, identity) => {
        backend.linkAppointmentPatient(state, apptId, patientId, identity); // eager validate — throws synchronously (e.g. already linked, or a foreign-owned file)
        applyAndMirror(
          (s) => backend.linkAppointmentPatient(s, apptId, patientId, identity),
          (m) => m.mirrorLinkAppointmentPatient(apptId, patientId),
        );
      },
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
          patientID: input.patientID, lead: input.lead, counterpartyName: input.identity.user.name,
        });
      },
      requestAdHocAuth: async (input) => {
        if (!live) {
          // Demo: validate against local doctor status (throws notAccepting) + mint the appointment.
          const { appt } = backend.requestAdHocAuth(state, input);
          setState((s) => ({ ...s, appointments: { ...s.appointments, [appt.id]: appt } }));
          return;
        }
        // Live: the server is authoritative (validates online/always-accept, mints the appointment).
        const m = await import("@/lib/firebase/mirror");
        await m.mirrorRequestAdHocAuth({
          doctorID: input.doctorID, dateISO: input.dateISO, atMinute: input.atMinute,
          patientID: input.patientID, lead: input.lead, counterpartyName: input.identity.user.name,
        });
        setRefreshTick((t) => t + 1);
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
      // Patient photo: optimistic local set, then a single-field patients/{id} update.
      // A demo-only dataUrl set has nothing to persist (never written to Firestore).
      setPatientAvatar: (patientID, avatar, identity) =>
        applyAndMirror(
          (s) => backend.setPatientAvatar(s, patientID, avatar, identity),
          (m) => avatar.avatarFileId !== undefined
            ? m.mirrorSetPatientAvatar(patientID, avatar.avatarFileId)
            : Promise.resolve(),
        ),
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
      profileForUser: (userID) => backend.profileForUser(state, userID),
      addressForIdentity: (identity) => backend.addressForIdentity(state, identity),
      setAddressForIdentity: (identity, address) =>
        setState((s) => backend.setAddressForIdentity(s, identity, address)),
      accounts: () => backend.accountsInventory(state),
      cooperatingDoctors: (identity) => backend.cooperatingDoctors(state, identity),
      cooperationRelationships: () => backend.cooperationRelationshipsList(state),
      relationshipAuditFor: (relationshipID) => backend.relationshipAuditForRelationship(state, relationshipID),
      setCooperationRelationship: (input, actor) => {
        // Eager-validate (throws before the async live branch); relationships are demo-writable.
        const next = backend.setCooperationRelationship(state, input, actor, now);
        if (!live) { setState(() => next); return; }
        void (async () => {
          try { const m = await import("@/lib/firebase/mirror"); await m.mirrorSetCooperationRelationship(input); setRefreshTick((t) => t + 1); }
          catch (e) { setLastSyncError(String(e)); }
        })();
      },
      removeCooperationRelationship: (relationshipID, actor) => {
        const next = backend.removeCooperationRelationship(state, relationshipID, actor, now);
        if (!live) { setState(() => next); return; }
        void (async () => {
          try { const m = await import("@/lib/firebase/mirror"); await m.mirrorRemoveCooperationRelationship(relationshipID); setRefreshTick((t) => t + 1); }
          catch (e) { setLastSyncError(String(e)); }
        })();
      },
      createUser: async (input) => {
        if (!live) throw new backend.BackendError("User creation is live-only in the demo.");
        // Server-authoritative (like bookAuthSlot): no optimistic write — the Function
        // creates the Auth record + users doc; rehydrate pulls the new account row.
        const m = await import("@/lib/firebase/mirror");
        await m.mirrorCreateUser(input);
        setRefreshTick((t) => t + 1);
      },
      resetUserPassword: async (email) => {
        if (!live) throw new backend.BackendError("Password reset is live-only in the demo.");
        const m = await import("@/lib/firebase/mirror");
        await m.mirrorResetUserPassword(email);
      },
      deleteUserAccount: async (uid) => {
        if (!live) throw new backend.BackendError("Account deletion is live-only in the demo.");
        // Server-authoritative like createUser: the Function removes the Auth record +
        // profile doc; rehydrate drops the row from Firestore truth.
        const m = await import("@/lib/firebase/mirror");
        await m.mirrorDeleteUserAccount(uid);
        setRefreshTick((t) => t + 1);
      },
      // Own-profile edit: optimistic local merge, then a rules-checked users/{uid} merge
      // write (mirrorUpdateProfile strips the demo-only avatarDataUrl + immutable abn).
      updateProfile: (edits, identity) =>
        applyAndMirror(
          (s) => backend.updateProfile(s, identity.user.id, edits),
          (m) => m.mirrorUpdateProfile(identity.user.id, edits),
        ),
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
