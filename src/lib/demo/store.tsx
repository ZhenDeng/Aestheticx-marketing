"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppointmentLead, DemoState, Identity, MedicationItem, TreatmentMedication } from "./types";
import { fullName, ownerKeyOf } from "./types";
import { buildSeedState, createDemoWriteClock, SEED_NOW } from "./seed";
import * as backend from "./backend";
import * as billing from "./billing";
import * as invoicing from "./invoicing";
import * as emergency from "./emergency";
import * as isolation from "./isolation";
// Pure (no firebase SDK), safe to import statically — categorises mirror failures so the
// banner distinguishes a permission lockout from a transient blip (16/07 feedback bug 1).
import { syncErrorMessage } from "@/lib/firebase/syncError";
import {
  PATIENT_FORM_SUBMISSIONS_KEY, formLinkAccountKey, loadPatientFormSubmissions,
  removePatientFormSubmission, savePatientFormLink, siloAccountKey,
  submissionsForAccount, submissionsForSilo,
  type PatientFormSubmission,
} from "./patientFormLinks";
import { useDemoAuth } from "./auth";

type Status = "demo" | "loading" | "ready" | "error";

interface StoreValue {
  state: DemoState;
  now: number;
  status: Status;
  // True while an action-triggered refresh re-hydrates OR a server-authoritative write's
  // callable is in flight (26/07 feedback) — the shell overlays the page; status stays
  // "ready" so pages don't unmount into "Loading…".
  refreshing: boolean;
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
  // premiseId (06/08): the premise of administration chosen ON THE REQUEST FORM. Absent keeps
  // the pre-06/08 behaviour — the profile's currently active premise.
  submitRequest: (input: { patientID: string; doctorID: string; items: MedicationItem[]; identity: Identity; premiseId?: string }) => void;
  approveRequest: (requestID: string, identity: Identity) => void;
  requireEdit: (requestID: string, identity: Identity) => void;
  resubmitRequest: (input: { requestID: string; items: MedicationItem[]; identity: Identity; premiseId?: string }) => void;
  editPendingRequest: (input: { requestID: string; items: MedicationItem[]; identity: Identity; premiseId?: string }) => void;
  withdrawRequest: (requestID: string, identity: Identity) => void;
  saveGeneralNote: (input: backend.SaveGeneralNoteInput) => void;
  saveTreatmentNote: (input: backend.SaveTreatmentNoteInput) => void;
  sendAftercare: (input: { patientID: string; content: string; medications: TreatmentMedication[]; categories: import("./aftercare").AftercareCategory[]; identity: Identity }) => void;
  // Same-day amendment window (owner feedback 06/08): the author may correct their own note
  // until midnight; from the next calendar day it is finalized. `canAmendNote` reads the
  // window against the session clock so a view never offers an edit the write would reject.
  canAmendNote: (note: import("./types").Note, identity: Identity) => boolean;
  amendNote: (input: backend.AmendNoteInput) => void;
  noteTemplatesForOwner: (ownerID: string) => ReturnType<typeof backend.noteTemplatesForOwner>;
  saveNoteTemplate: (template: import("./types").NoteTemplate, identity: Identity) => void;
  deleteNoteTemplate: (id: string, identity: Identity) => void;
  followUpSettingsForUser: (userID: string) => ReturnType<typeof backend.followUpSettingsForUser>;
  followUpTasksForOwnerOn: (ownerID: string, dateISO: string) => ReturnType<typeof backend.followUpTasksForOwnerOn>;
  setFollowUpSettings: (settings: import("./types").FollowUpSettings, identity: Identity) => void;
  appointmentReminderForUser: (userID: string) => ReturnType<typeof backend.appointmentReminderForUser>;
  setAppointmentReminder: (lead: import("./types").AppointmentReminderLead, identity: Identity) => void;
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
  treatmentBlocksForOwnerOnDay: (ownerID: string, dateISO: string) => import("./types").TreatmentBlock[];
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
  listAvailableDoctors: () => Promise<{ doctorID: string; doctorName: string; hasSlots: boolean; alwaysAcceptAuth: boolean }[]>;
  // The full prescribing-doctor directory for the auth-request picker (live: listDoctors
  // callable; demo: the DEMO_ACCOUNTS doctors).
  listDoctors: () => Promise<{ doctorId: string; doctorName: string }[]>;
  // Cooperation-relationship gate (spec 2026-07-08): the doctors the acting nurse/clinic may
  // request from — a sync selector over hydrated state (works in demo + live).
  cooperatingDoctors: (identity: Identity) => ReturnType<typeof backend.cooperatingDoctors>;
  cooperationRelationships: () => ReturnType<typeof backend.cooperationRelationshipsList>;
  /** Clinic directory for the admin console's cooperation picker (live: super-admin
   *  hydration of the clinics collection; demo: the seeded clinic). */
  clinics: () => ReturnType<typeof backend.clinicDirectoryList>;
  /** Directory row for one clinic, or null when not hydrated (live hydrates the directory for
   *  super-admins only — clinic identities carry their own address on the ClinicRef instead). */
  clinicByID: (id: string) => import("./types").ClinicRef | null;
  relationshipAuditFor: (relationshipID: string) => ReturnType<typeof backend.relationshipAuditForRelationship>;
  setCooperationRelationship: (input: import("./backend").SetCooperationRelationshipInput, actor: Identity) => void;
  removeCooperationRelationship: (relationshipID: string, actor: Identity) => void;
  /** Nurse↔clinic employment (spec: 2026-07-25): the active grants + a super-admin
   *  grant/revoke. Demo-writable; live best-effort mirrors to the setClinicMembership callable. */
  clinicEmployments: () => ReturnType<typeof backend.clinicEmploymentsList>;
  setClinicEmployment: (input: import("./backend").SetClinicEmploymentInput, actor: Identity) => void;
  // Admin-editable catalog (Tier 3 #5B): the full product list + super-admin upsert / active toggle.
  catalogProducts: () => ReturnType<typeof backend.catalogProductsList>;
  setProduct: (input: import("./backend").SetProductInput, actor: Identity) => void;
  setProductActive: (id: string, isActive: boolean, actor: Identity) => void;
  // First-class Business Entities (Tier 3 #4): the full entity list + super-admin upsert / active toggle.
  businessEntities: () => ReturnType<typeof backend.businessEntitiesList>;
  setBusinessEntity: (input: import("./backend").SetBusinessEntityInput, actor: Identity) => Promise<void>;
  setBusinessEntityActive: (id: string, isActive: boolean, actor: Identity) => Promise<void>;
  // Platform audit log (constitution §21). Durable in live (hydrated from the `auditLog`
  // collection) and in-session in demo. recordAdminAccess logs an admin patient-file open.
  auditLog: () => ReturnType<typeof backend.auditLogEntries>;
  recordAdminAccess: (patient: import("./types").Patient, identity: Identity) => void;
  listDoctorOpenSlots: (doctorID: string, dateISO: string) => Promise<number[]>;
  publishAvailability: (input: import("./backend").PublishAvailabilityInput, identity: Identity) => void;
  withdrawAvailability: (windowID: string, identity: Identity) => void;
  bookAuthSlot: (input: import("./backend").BookAuthSlotInput) => Promise<void>;
  requestAdHocAuth: (input: import("./backend").RequestAdHocAuthInput) => Promise<void>;
  bookTreatmentAppointment: (input: import("./backend").BookTreatmentInput) => void;
  rescheduleAppointment: (id: string, dateISO: string, startMinute: number, durationMinutes: number, identity: Identity) => void;
  /**
   * Send the client email for an already-committed action (moved / confirmed / cancelled).
   * Only ever called from the Notify dialog's Send button. No-op in demo.
   */
  notifyAppointmentAction: (id: string, action: import("@/components/app/NotifyClient").NotifyClientAction) => void;
  markAppointment: (id: string, status: "completed" | "noShow" | "cancelled", identity: Identity) => void;
  linkAppointmentPatient: (apptId: string, patientId: string, identity: Identity) => void;
  createPatient: (draft: import("./types").PatientDraft, identity: Identity) => string;
  /** Create a patient file from a lead appointment and link it, atomically. Returns the new patient id. */
  createPatientForAppointment: (apptId: string, draft: import("./types").PatientDraft, identity: Identity) => string;
  // New-patient form links (change: patient-form-link-generation): mint a tokenised link to
  // the public /intake form; submissions surface as pending-review cards visible only to the
  // generating account, which approves (the normal createPatient path, edits allowed) or
  // declines. Browser-local storage in both modes — see patientFormLinks.ts.
  /** Mints a link for this account and returns its token. Throws when storage is unavailable. */
  createPatientFormLink: (identity: Identity) => string;
  patientFormSubmissionsFor: (identity: Identity) => PatientFormSubmission[];
  /** Approve = create the patient through the normal path (validation/ownership identical to
   *  the New patient form) + remove the pending card. Returns the new patient id. */
  approvePatientFormSubmission: (submissionID: string, draft: import("./types").PatientDraft, identity: Identity) => string;
  declinePatientFormSubmission: (submissionID: string, identity: Identity) => void;
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
  deleteInvoice: (invoiceID: string, identity: Identity) => void;
  markInvoicePaid: (invoiceID: string, identity: Identity) => void;
  // Billing matrix (change: multi-tenant-billing-matrix). Demo-mode-first: the reducers
  // run only in demo; live mode flags the feature off until the backend repo ships
  // collections + callables, and the UI hides the surfaces behind matrixEnabled.
  matrixEnabled: boolean;
  patientAccess: (patient: import("./types").Patient, identity: Identity) => import("./isolation").PatientAccessLevel;
  walletEntries: (patientID: string) => import("./types").WalletEntry[];
  walletBalance: (patientID: string) => number;
  priceListFor: (owner: import("./types").PatientOwner) => import("./types").PriceListItem[];
  topUpWallet: (input: import("./backend").TopUpWalletInput, identity: Identity) => void;
  checkoutClient: (input: import("./backend").CheckoutClientInput, identity: Identity) => void;
  finalizeServiceFee: (invoiceID: string, identity: Identity) => void;
  // Manual service invoicing shipped its live callable (backend PR #115), so it is no
  // longer matrix-gated: available in both modes.
  serviceInvoicingEnabled: boolean;
  createServiceInvoice: (input: import("./backend").CreateServiceInvoiceInput, identity: Identity) => void;
  // Manual client invoice (spec: manual client invoicing, 2026-07-24). Returns the invoice
  // for PDF hand-off; demo persists it, live builds it transiently (no server record yet).
  createClientInvoice: (input: import("./backend").CreateClientInvoiceInput, identity: Identity) => import("./invoicing").Invoice;
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

/**
 * Rebuilds the store whenever the tab switches between the sandbox and live. The inner
 * provider snapshots `live` into its initial state, `status` and `now` at mount, so a mode
 * flip has to remount it — otherwise a tab entering /demo would keep the empty,
 * Firestore-shaped state and never load the seed (a blank app).
 */
export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const { mode } = useDemoAuth();
  return <ModeScopedStoreProvider key={mode}>{children}</ModeScopedStoreProvider>;
}

function ModeScopedStoreProvider({ children }: { children: ReactNode }) {
  // Mode comes from the auth provider, which is the single source of truth — deriving it
  // here from isFirebaseConfigured() again would let the store and the provider disagree
  // once a tab enters the sandbox on a Firebase-configured deployment.
  const { mode, identity, availableIdentities } = useDemoAuth();
  const live = mode === "live";
  const [state, setState] = useState<DemoState>(() => (live ? backend.emptyState() : buildSeedState()));
  const [status, setStatus] = useState<Status>(live ? "loading" : "demo");
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  // True while a REFRESH re-hydrate runs (action-triggered, same identity set already
  // hydrated) — the shell overlays the page instead of unmounting it (20/07 feedback).
  const [refreshing, setRefreshing] = useState(false);
  // In-flight server-authoritative writes (26/07 feedback): the fire-and-forget callable
  // branches gave no feedback until the post-write rehydrate raised `refreshing`, so buttons
  // sat dead for the callable's seconds. The overlay must cover the callable itself.
  const [pendingWrites, setPendingWrites] = useState(0);
  const runLiveWrite = useCallback((fn: () => Promise<void>) => {
    setPendingWrites((n) => n + 1);
    void (async () => {
      try { await fn(); } finally { setPendingWrites((n) => n - 1); }
    })();
  }, []);
  // `${uid}|${identitySetKey}` of the last COMPLETED hydrate — how a re-run knows it is
  // a refresh rather than a first load or an identity switch.
  const hydratedKeyRef = useRef<string | null>(null);
  // Captured once per provider mount (live: session start; demo: fixed SEED_NOW).
  // Lazy initializer keeps the impure Date.now() out of the render path.
  // READ-side "now" only — expiry windows and the demo's frozen "today". Writes must NOT use
  // it in demo: they would tie with the SEED_NOW-stamped seed and sort below it (see writeNow).
  const [now] = useState(() => (live ? Date.now() : SEED_NOW));
  const [demoWriteClock] = useState(() => createDemoWriteClock());
  // Stamp for a NEW record. Live has a real clock; demo advances a per-provider sequence so
  // each write lands strictly after the seed, and after every earlier write in the session.
  const writeNow = useCallback(() => (live ? Date.now() : demoWriteClock()), [live, demoWriteClock]);

  // New-patient form-link submissions (change: patient-form-link-generation). NOT part of
  // DemoState: a submission exists before any patient record does and must survive demo
  // reseeds. Demo: browser-local (the /intake page writes from its own tab, so reload on
  // cross-tab storage events; the focus listener covers a same-tab round trip). Live
  // (round 2): server-backed — hydrated from the `patientIntakes` collection below, so the
  // link works from ANY device; localStorage plays no part and the listeners stay off.
  const [formSubmissions, setFormSubmissions] = useState<Record<string, PatientFormSubmission>>({});
  useEffect(() => {
    if (live) return;
    const reload = () => setFormSubmissions(loadPatientFormSubmissions(window.localStorage));
    reload();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PATIENT_FORM_SUBMISSIONS_KEY) reload();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reload);
    };
  }, [live]);
  const dropFormSubmission = useCallback((id: string) => {
    if (live) {
      // Mirror the delete (rules: the owning silo may remove its own docs). The local
      // card is already gone; a failure leaves the sync banner and rehydrate restores it.
      void (async () => {
        try {
          const m = await import("@/lib/firebase/patientIntake");
          await m.deletePatientIntake(id);
        } catch (e) {
          setLastSyncError(syncErrorMessage(e));
        }
      })();
    } else {
      removePatientFormSubmission(window.localStorage, id);
    }
    setFormSubmissions((subs) => {
      const rest = { ...subs };
      delete rest[id];
      return rest;
    });
  }, [live]);

  // Latest patients map for the requests listener's hasPatient check — a ref, not a dep,
  // so the subscription isn't torn down on every state change.
  const patientsRef = useRef(state.patients);
  useEffect(() => { patientsRef.current = state.patients; }, [state.patients]);

  // auth.tsx rebuilds availableIdentities as a NEW array on every watchUser callback
  // (including routine token refreshes), which used to be a cheap re-hydrate but would now
  // also tear down and rebuild every request listener. Key the effect on the identity-set
  // CONTENT instead, and read the latest array through a ref at run time.
  const availableIdentitiesRef = useRef(availableIdentities);
  useEffect(() => { availableIdentitiesRef.current = availableIdentities; }, [availableIdentities]);
  const identitySetKey = useMemo(
    () => (availableIdentities.length ? availableIdentities : identity ? [identity] : [])
      .map((i) => `${i.user.id}:${i.role}:${i.context.kind === "clinic" ? i.context.clinic.id : ""}`)
      .sort()
      .join("|"),
    [availableIdentities, identity],
  );

  // Live hydrate whenever the signed-in user changes or a refresh is requested.
  useEffect(() => {
    if (!live || !identity) return;
    let cancelled = false;
    let unsubscribeRequests: (() => void) | undefined;
    let unsubscribeAppointments: (() => void) | undefined;
    // A re-run for an identity set that already completed a hydrate is a REFRESH (an
    // action bumped refreshTick): keep the rendered page and let the shell overlay it
    // (20/07 feedback) instead of flipping status to "loading", which unmounts every
    // page into its bare "Loading…" early-return. First loads and identity switches
    // keep the full-page loading state.
    const isRefresh = hydratedKeyRef.current === `${identity.user.id}|${identitySetKey}`;
    (async () => {
      if (isRefresh) setRefreshing(true); else setStatus("loading");
      try {
        const { hydrate } = await import("@/lib/firebase/hydrate");
        // Hydrate across ALL of the user's identities (roles + clinics), not just the
        // selected one, so a multi-clinic user sees their full visible data set.
        const availableNow = availableIdentitiesRef.current;
        const ids = availableNow.length ? availableNow : [identity];
        const allClinics = Object.assign({}, ...ids.map(clinicMap));
        const allRoles = [...new Set(ids.map((i) => i.role))];
        const next = await hydrate({ uid: identity.user.id, roles: allRoles, clinics: allClinics });
        if (cancelled) return;
        setState(next);
        setStatus("ready");
        hydratedKeyRef.current = `${identity.user.id}|${identitySetKey}`;
        // A successful hydrate is the authoritative recovery point. In particular,
        // first-login can briefly race a stale ID token and report permission-denied,
        // then immediately succeed after the refreshed claims arrive. Do not leave that
        // recovered failure pinned as a permanent access banner.
        setLastSyncError(null);
        // Keep authRequests current AFTER the one-shot hydrate (owner bug 2, 2026-07-13):
        // without listeners a signed-in doctor never saw a nurse's new request until they
        // re-authenticated. Subscribing after hydrate resolves means the first full listener
        // union always replaces an equal-or-older snapshot, never races it. Listener setup
        // is an enhancement over the hydrated snapshot — its failure must not error a store
        // that already loaded, so it gets its own catch.
        try {
          const { subscribeAuthRequests } = await import("@/lib/firebase/requestsLive");
          unsubscribeRequests = subscribeAuthRequests(
            // superAdmin: hydrate loaded the platform-wide request set, so the listener
            // must be unconstrained too — scoped queries would replace it with ~nothing.
            // The full membership MAP goes through (not just ids): the listener only
            // subscribes clinic scopes for "admin" memberships, mirroring the rules.
            { uid: identity.user.id, clinics: allClinics, superAdmin: allRoles.includes("superAdmin") },
            {
              onRequests: (requests) => setState((s) => ({ ...s, requests })),
              hasPatient: (id) => !!patientsRef.current[id],
              // Reviewer file access for a listener-delivered request: merge the fetched
              // patient only if hydrate didn't already load it (never clobber local edits).
              onPatient: (patient) =>
                setState((s) => (s.patients[patient.id] ? s : { ...s, patients: { ...s.patients, [patient.id]: patient } })),
              // A dropped scope listener freezes that scope's rows until the next
              // rehydrate — reuse the sync-error banner so the staleness is visible.
              onScopeError: () =>
                setLastSyncError("Live request updates were interrupted — refresh to make sure the list is current."),
            },
          );
          if (cancelled) unsubscribeRequests(); // cleanup ran while the module was loading
        } catch {
          // Stay on the one-shot snapshot; manual rehydrate still works.
        }
        // Keep appointments current too (16/07 feedback bug 3): a cancel from any client
        // must drop off the dashboard's upcoming-calls list without a refresh. Same
        // enhancement-over-snapshot contract as the requests listener — its failure must
        // not error a store that already loaded.
        try {
          const { subscribeAppointments } = await import("@/lib/firebase/appointmentsLive");
          unsubscribeAppointments = subscribeAppointments(
            { uid: identity.user.id, clinicIds: Object.keys(allClinics), superAdmin: allRoles.includes("superAdmin") },
            {
              onAppointments: (appointments) => setState((s) => ({ ...s, appointments })),
              hasPatient: (id) => !!patientsRef.current[id],
              // Consult-call file access (28/07): a call booked while this doctor is signed
              // in opens that patient's file, but hydrate ran before the booking existed.
              // Merge only when hydrate didn't already load it (never clobber local edits).
              onPatient: (patient) =>
                setState((s) => (s.patients[patient.id] ? s : { ...s, patients: { ...s.patients, [patient.id]: patient } })),
              onScopeError: () =>
                setLastSyncError("Live calendar updates were interrupted — refresh to make sure appointments are current."),
            },
          );
          if (cancelled) unsubscribeAppointments(); // cleanup ran while the module was loading
        } catch {
          // Stay on the one-shot snapshot; manual rehydrate still works.
        }
        // Pending form-link submissions (round 2): server-backed, loaded alongside the
        // snapshot. An enhancement over the hydrated store — its failure must not error
        // a store that already loaded, so it gets its own catch.
        try {
          const { fetchPatientIntakes } = await import("@/lib/firebase/patientIntake");
          const intakes = await fetchPatientIntakes(identity.user.id, Object.keys(allClinics));
          if (!cancelled) setFormSubmissions(Object.fromEntries(intakes.map((s) => [s.id, s])));
        } catch {
          // Keep whatever cards are already shown; manual rehydrate still works.
        }
      } catch (e) {
        // A failed REFRESH keeps the already-rendered data and reports through the
        // sync-error banner; only a failed first load blanks into the error state.
        if (!cancelled && isRefresh) setLastSyncError(syncErrorMessage(e));
        else if (!cancelled) { setStatus("error"); setLastSyncError(syncErrorMessage(e)); }
      } finally {
        if (isRefresh && !cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
      // A cancelled refresh must relinquish the flag ITSELF: its finally skips the reset
      // (cancelled), and if the superseding run is a FULL load (identity set changed —
      // e.g. a self-admin toggling their own membership grew their identities via the
      // claims watcher), nothing else would ever clear it and the Syncing overlay never
      // ends. Cleanup runs before the next effect body, so a superseding refresh
      // re-raises the flag right after this reset.
      if (isRefresh) setRefreshing(false);
      unsubscribeRequests?.();
      unsubscribeAppointments?.();
    };
    // identitySetKey stands in for availableIdentities (content-keyed; read via ref) so
    // token-refresh array churn doesn't tear down the listeners.
  }, [live, identity, identitySetKey, refreshTick]);

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
          // The optimistic local apply was never persisted. Surface a CATEGORISED banner
          // (permission vs transient — 16/07 feedback bug 1) and rehydrate so the UI
          // reconciles back to Firestore truth rather than showing phantom data. On a
          // permission failure, force one ID-token refresh: a nurse whose claims were just
          // repaired server-side is stuck on a stale token until she refreshes, so do it
          // for her — if it was a real denial the retry still fails, harmlessly.
          const { syncErrorMessage, isPermissionError } = await import("@/lib/firebase/syncError");
          setLastSyncError(syncErrorMessage(e));
          if (isPermissionError(e)) {
            try { const { refreshIdToken } = await import("@/lib/firebase/auth"); await refreshIdToken(); } catch { /* keep the old token */ }
          }
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
      refreshing: refreshing || pendingWrites > 0,
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
      // Folds the cooperation-relationship override (spec 2026-07-08): override → scriptPricing → default.
      scriptPrice: (did, cid) => backend.resolvedScriptPriceCents(state, did, cid),
      billableAuthorisations: (did) => backend.billableAuthorisations(state, did),
      setScriptPrice: (cid, priceCents, id) => {
        if (!live) { setState((s) => backend.setScriptPrice(s, id.user.id, cid, priceCents)); return; }
        runLiveWrite(async () => {
          try { const m = await import("@/lib/firebase/invoices"); await m.setScriptPrice(cid, priceCents); setRefreshTick((t) => t + 1); }
          catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      generateInvoice: (input, id) => {
        if (!live) { setState((s) => backend.generateInvoice(s, input, id, writeNow()).state); return; }
        runLiveWrite(async () => {
          try {
            const m = await import("@/lib/firebase/invoices");
            await m.generateInvoice({ counterpartyID: input.counterpartyID, counterpartyType: input.counterpartyType, periodLabel: input.periodLabel, authorisationIDs: input.authIDs });
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      // Delete an invoice to correct an error (16/07 enhancement 2). Same demo-reducer /
      // live-callable split — invoices are Function-only docs; the callable returns the
      // member authorisations to the un-invoiced pool transactionally.
      deleteInvoice: (invoiceID, id) => {
        if (!live) { setState((s) => backend.deleteInvoice(s, invoiceID, id, writeNow())); return; }
        runLiveWrite(async () => {
          try {
            const m = await import("@/lib/firebase/invoices");
            await m.deleteInvoice(invoiceID);
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      // Mark an invoice paid (Tier 3 #6). Same demo-reducer / live-callable split as generateInvoice —
      // invoices are Function-only Firestore docs, so live routes through the markInvoicePaid callable.
      markInvoicePaid: (invoiceID, id) => {
        if (!live) { setState((s) => backend.markInvoicePaid(s, invoiceID, id, writeNow())); return; }
        runLiveWrite(async () => {
          try {
            const m = await import("@/lib/firebase/invoices");
            await m.markInvoicePaid(invoiceID);
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      // Billing matrix: demo-mode reducers only. Live callers never reach these — the UI
      // gates every surface behind matrixEnabled — but a friendly sync error covers a
      // future slip rather than throwing into React.
      matrixEnabled: !live,
      patientAccess: (patient, id) => isolation.patientAccessLevel(state, id, patient),
      walletEntries: (pid) => state.walletByPatientID[pid] ?? [],
      walletBalance: (pid) => backend.walletBalanceCents(state, pid),
      priceListFor: (owner) => state.priceListByOwner[ownerKeyOf(owner)] ?? [],
      topUpWallet: (input, id) => {
        if (!live) { setState((s) => backend.topUpWallet(s, input, id, writeNow())); return; }
        setLastSyncError("Account top-ups are not yet available in live mode.");
      },
      checkoutClient: (input, id) => {
        if (!live) { setState((s) => backend.checkoutClient(s, input, id, writeNow())); return; }
        setLastSyncError("Client checkout is not yet available in live mode.");
      },
      finalizeServiceFee: (invoiceID, id) => {
        if (!live) { setState((s) => backend.finalizeServiceFeeInvoice(s, invoiceID, id, writeNow())); return; }
        setLastSyncError("Service-fee invoices are not yet available in live mode.");
      },
      serviceInvoicingEnabled: true,
      createServiceInvoice: (input, id) => {
        if (!live) { setState((s) => backend.createServiceInvoice(s, input, id, writeNow())); return; }
        runLiveWrite(async () => {
          try {
            const m = await import("@/lib/firebase/invoices");
            await m.createServiceInvoice({
              clinicID: input.clinicID,
              issuerRole: id.role === "doctor" ? "doctor" : "nurse",
              lines: input.lines,
              chargeGst: input.chargeGst ?? true,
              gstIncluded: input.gstIncluded ?? false,
            });
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      createClientInvoice: (input, id) => {
        // Build once (eager-validate + stable id) and hand the invoice back either way so
        // the caller can render the PDF immediately. Demo persists that exact invoice;
        // live persists via the createClientInvoice callable (02/08: issued client
        // invoices are RECORDS — re-downloadable and deletable) and rehydrates, so the
        // stored copy (server id + server-frozen snapshots) replaces the transient one.
        const now = writeNow();
        const invoice = backend.buildClientInvoice(state, input, id, now);
        if (!live) {
          setState((s) => backend.recordClientInvoice(s, invoice, id, now));
          return invoice;
        }
        runLiveWrite(async () => {
          try {
            const m = await import("@/lib/firebase/invoices");
            await m.createClientInvoice({
              patientID: input.patientID,
              lines: input.lines,
              chargeGst: input.chargeGst,
              gstIncluded: input.gstIncluded,
              ...(input.appointmentID ? { appointmentID: input.appointmentID } : {}),
            });
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
        return invoice;
      },
      pendingRequestsForDoctor: (did) => backend.pendingRequestsForDoctor(state, did),
      openRequestsForPatient: (pid, nid) => backend.openRequestsForPatient(state, pid, nid),
      submitRequest: (input) => {
        // Mint the id eagerly (outside the updater) so the local copy and the mirrored
        // doc share one id. A functional setState updater re-runs under React Strict Mode,
        // which would otherwise generate a second id inside the updater and diverge from
        // the value captured here for the mirror. See createPatient for the same pattern.
        const { state: next, request } = backend.submitRequest(state, input, writeNow());
        applyAndMirror(() => next, (m) => m.mirrorCreateRequest(request));
      },
      approveRequest: (requestID, id) =>
        // generateEmergency/recordAudit/generateApprovalNote: !live — in live mode the backend
        // Cloud Function writes the emergency records, the §21 audit entry, AND the combined
        // approval-PDF treatment note (round 6), and hydrate reads them; the optimistic client
        // must not fabricate phantom ones that would vanish on the next hydrate.
        applyAndMirror((s) => backend.approveRequest(s, requestID, id, writeNow(), { generateEmergency: !live, recordAudit: !live, generateApprovalNote: !live }).state, (m) => m.mirrorApproveRequest(requestID)),
      requireEdit: (requestID, id) =>
        // auditNow: demo writes the §21 `request_edit_requested` entry with the session clock; live
        // passes undefined so the requireEdit Cloud Function + hydrate own the durable entry.
        applyAndMirror((s) => backend.requireEdit(s, requestID, id, live ? undefined : writeNow()), (m) => m.mirrorRequireEdit(requestID)),
      resubmitRequest: (input) => {
        // The premise the reducer will stamp, read off a run against the SAME state the local
        // apply starts from, so the mirrored doc and the local copy can never disagree.
        // undefined when the caller did not re-stamp — that keeps `premise` out of the update's
        // affected keys entirely, which is what lets an items-only edit keep working for a
        // session still on the pre-06/08 rules.
        const restamped = input.premiseId
          ? backend.resubmitRequest(state, input).requests[input.requestID]?.premise ?? null
          : undefined;
        applyAndMirror(
          (s) => backend.resubmitRequest(s, input),
          (m) => m.mirrorResubmitRequest(input.requestID, input.items, restamped),
        );
      },
      // Amend an untouched pending request in place — items only, status stays pending
      // (Tier 3 #7). Eager-validate FIRST (like confirmAppointment): if the doctor approved/
      // returned the request between opening the editor and submitting, backend.editPendingRequest
      // throws `notPermitted` — doing it before applyAndMirror keeps that throw in the event
      // handler, not inside the setState updater (a render-phase crash with no error boundary).
      editPendingRequest: (input) => {
        const validated = backend.editPendingRequest(state, input); // eager validate — throws synchronously if actioned elsewhere
        // Same reasoning as resubmitRequest: reuse the validated run rather than recomputing.
        const restamped = input.premiseId ? validated.requests[input.requestID]?.premise ?? null : undefined;
        applyAndMirror(
          (s) => backend.editPendingRequest(s, input),
          (m) => m.mirrorEditPendingRequest(input.requestID, input.items, restamped),
        );
      },
      withdrawRequest: (requestID, id) =>
        applyAndMirror((s) => backend.withdrawRequest(s, requestID, id), (m) => m.mirrorWithdrawRequest(requestID)),
      saveGeneralNote: (input) => {
        // Mint the note id eagerly so the local copy and the mirrored doc agree (Strict
        // Mode re-runs the updater — see createPatient / submitRequest).
        const { state: next, note } = backend.saveGeneralNote(state, input, writeNow());
        applyAndMirror(() => next, (m) => m.mirrorCreateNote(input.patientID, note));
      },
      saveTreatmentNote: (input) => {
        // Mint the note + follow-up ids eagerly so the local copies and the mirrored docs
        // share one id each. Inside the Strict-Mode-double-invoked updater they would
        // diverge, leaving the follow-up's sourceNoteID pointing at a phantom note id.
        const { state: next, note, followUp } = backend.saveTreatmentNote(state, input, writeNow());
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
        // The practitioner's mail client sends the email (AftercareForm opens a mailto), so this
        // only records that aftercare was issued. Nothing calls the sendAftercare callable any
        // more — the web writes the note itself, exactly like saveGeneralNote. (iOS still uses
        // the callable; the backend is unchanged.) Id minted eagerly so the local copy and the
        // mirrored doc agree under Strict Mode's double-invoked updater.
        const { state: next, note } = backend.recordAftercareSend(state, input, writeNow());
        applyAndMirror(() => next, (m) => m.mirrorCreateNote(input.patientID, note));
      },
      // Read against the session `now` (demo: the frozen SEED_NOW), so the demo's seeded
      // notes read as finalized while anything written in-session stays editable.
      canAmendNote: (note, id) => backend.canAmendNote(state, note, id, now),
      amendNote: (input) => {
        // Validate + build eagerly, like saveGeneralNote: Strict Mode double-invokes the
        // updater, and the mirrored doc must carry the same editedAt as the local copy.
        const { state: next, note } = backend.amendNote(state, input, writeNow());
        applyAndMirror(() => next, (m) => m.mirrorAmendNote(input.patientID, note));
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
      setFollowUpSettings: (settings, identity) => {
        // Mirror the NORMALISED settings (not the raw UI object) so Firestore's back-compat
        // followUpIntervalDays reflects the new preset, not the stale one the UI spread from.
        const normalized = backend.normalizeFollowUpSettings(settings);
        applyAndMirror(
          (s) => backend.setFollowUpSettings(s, normalized, identity),
          (m) => m.mirrorSetFollowUpSettings(identity.user.id, normalized),
        );
      },
      appointmentReminderForUser: (userID) => backend.appointmentReminderForUser(state, userID),
      setAppointmentReminder: (lead, identity) =>
        applyAndMirror(
          (s) => backend.setAppointmentReminder(s, lead, identity),
          (m) => m.mirrorSetAppointmentReminder(identity.user.id, lead),
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
        // pendingWrites bump: the Notify dialog opens in the same commit and its Send button
        // gates on store.refreshing — see the rescheduleAppointment comment below.
        if (live) setPendingWrites((n) => n + 1);
        applyAndMirror(
          (s) => backend.confirmAppointment(s, id, identity),
          // notifyClient:false — the calendar asks the practitioner and sends separately.
          async (m) => {
            try {
              await m.mirrorConfirmAppointment(id, false);
            } finally {
              setPendingWrites((n) => n - 1);
            }
          },
        );
      },
      appointmentsForOwnerOnDay: (ownerID, dateISO) => backend.appointmentsForOwnerOnDay(state, ownerID, dateISO),
      appointmentsForOwnerInRange: (ownerID, startISO, endISO) => backend.appointmentsForOwnerInRange(state, ownerID, startISO, endISO),
      appointmentsForPatient: (patientID) => backend.appointmentsForPatient(state, patientID),
      availabilityWindowsForDoctor: (doctorID) => backend.availabilityWindowsForDoctor(state, doctorID),
      doctorsWithAvailability: () => backend.doctorsWithAvailability(state),
      treatmentAvailabilityForOwner: (ownerID) => backend.treatmentAvailabilityForOwner(state, ownerID),
      treatmentBlocksForOwnerOnDay: (ownerID, dateISO) => backend.treatmentBlocksForOwnerOnDay(state, ownerID, dateISO),
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
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        })();
      },
      rescheduleAppointment: (id, dateISO, startMinute, durationMinutes, identity) => {
        backend.rescheduleAppointment(state, id, dateISO, startMinute, durationMinutes, identity); // eager validate — throws
        // Track this write in pendingWrites (27/07 review, finding C2): the NotifyClient
        // dialog can open in the same commit as this call, and its Send button reads
        // store.refreshing to avoid emailing before the move has actually landed server-side
        // (or emailing a move that a failed mirror is about to revert). applyAndMirror stays
        // silent for every OTHER call site — this is the one write important enough to gate a
        // user-facing button on.
        if (live) setPendingWrites((n) => n + 1);
        applyAndMirror(
          (s) => backend.rescheduleAppointment(s, id, dateISO, startMinute, durationMinutes, identity),
          // notifyClient:false — the calendar asks the practitioner and sends separately.
          async (m) => {
            try {
              await m.mirrorRescheduleAppointment(id, dateISO, startMinute, durationMinutes, false);
            } finally {
              setPendingWrites((n) => n - 1);
            }
          },
        );
      },
      notifyAppointmentAction: (id, action) => {
        if (!live) return; // demo has no mail pipeline — the dialog still opens and closes
        runLiveWrite(async () => {
          try {
            const m = await import("@/lib/firebase/mirror");
            // Reschedule keeps its dedicated, longer-deployed callable; confirm/cancel share
            // the newer notifyAppointmentAction one (2026-07-28).
            if (action === "rescheduled") await m.mirrorNotifyAppointmentRescheduled(id);
            else await m.mirrorNotifyAppointmentAction(id, action);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      markAppointment: (id, status, identity) => {
        backend.markAppointment(state, id, status, identity); // eager validate — throws synchronously (e.g. already actioned)
        // Only a cancellation raises the Notify dialog, whose Send button gates on
        // store.refreshing — so only that write needs the pendingWrites bump.
        const gated = live && status === "cancelled";
        if (gated) setPendingWrites((n) => n + 1);
        applyAndMirror(
          (s) => backend.markAppointment(s, id, status, identity),
          // notifyClient:false — the calendar asks the practitioner and sends separately.
          async (m) => {
            try {
              await m.mirrorMarkAppointment(id, status, false);
            } finally {
              if (gated) setPendingWrites((n) => n - 1);
            }
          },
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
          bookedById: backend.appointmentOwnerScope(input.identity),
        });
      },
      requestAdHocAuth: async (input) => {
        if (!live) {
          // Demo: validate against local doctor status (throws notAccepting) + mint the appointment.
          const { appt } = backend.requestAdHocAuth(state, input);
          setState((s) => ({ ...s, appointments: { ...s.appointments, [appt.id]: appt } }));
          return;
        }
        // Live: the server is authoritative (validates always-accept, mints the appointment).
        const m = await import("@/lib/firebase/mirror");
        await m.mirrorRequestAdHocAuth({
          doctorID: input.doctorID, dateISO: input.dateISO, atMinute: input.atMinute,
          patientID: input.patientID, lead: input.lead, counterpartyName: input.identity.user.name,
          bookedById: backend.appointmentOwnerScope(input.identity),
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
            catch (e) { setLastSyncError(syncErrorMessage(e)); setRefreshTick((t) => t + 1); }
          })();
        }
        return patient.id;
      },
      createPatientFormLink: (identity) => {
        const token = crypto.randomUUID();
        const saved = savePatientFormLink(window.localStorage, {
          token, accountKey: formLinkAccountKey(identity), accountName: identity.user.name,
          createdAt: Date.now(),
        });
        // Never hand out a link that can't be persisted — the visitor would hit "invalid link".
        if (!saved) throw new backend.BackendError("validationFailed");
        return token;
      },
      // Demo scopes per identity (localStorage key); live scopes per data silo — the
      // server stamps submissions with ownerType/ownerId, matching iOS and the rules.
      patientFormSubmissionsFor: (identity) =>
        live ? submissionsForSilo(formSubmissions, identity) : submissionsForAccount(formSubmissions, identity),
      approvePatientFormSubmission: (submissionID, draft, identity) => {
        // Scope check mirrors the selector: only the generating account may act on a card.
        const sub = formSubmissions[submissionID];
        const scopeKey = live ? siloAccountKey(identity) : formLinkAccountKey(identity);
        if (!sub || sub.accountKey !== scopeKey) throw new backend.BackendError("notFound");
        // Same eager-create + mirror shape as createPatient above (Strict Mode: mint outside
        // the updater). One action, create first: a validation/permission throw must leave
        // the pending card intact for another attempt.
        const { patient } = backend.createPatient(state, draft, identity);
        setState((s) => ({ ...s, patients: { ...s.patients, [patient.id]: patient } }));
        if (live) {
          void (async () => {
            try { const m = await import("@/lib/firebase/mirror"); await m.mirrorCreatePatient(patient); }
            catch (e) { setLastSyncError(syncErrorMessage(e)); setRefreshTick((t) => t + 1); }
          })();
        }
        dropFormSubmission(submissionID);
        return patient.id;
      },
      declinePatientFormSubmission: (submissionID, identity) => {
        const sub = formSubmissions[submissionID];
        const scopeKey = live ? siloAccountKey(identity) : formLinkAccountKey(identity);
        if (!sub || sub.accountKey !== scopeKey) return;
        dropFormSubmission(submissionID);
      },
      createPatientForAppointment: (apptId, draft, identity) => {
        // Create + link as ONE action (28/07): the calendar's create-from-lead used to be
        // two same-tick calls, and the link's eager validation ran against a closure that
        // did not yet contain the just-created patient — so the file was created but the
        // appointment silently kept its lead. Validate both against the same composed
        // state (throws before anything applies), apply once, and mirror the create
        // BEFORE the link so the callable never races the patient doc into existence.
        const { patient } = backend.createPatient(state, draft, identity);
        const withPatient = { ...state, patients: { ...state.patients, [patient.id]: patient } };
        backend.linkAppointmentPatient(withPatient, apptId, patient.id, identity); // eager validate — throws
        applyAndMirror(
          (s) => backend.linkAppointmentPatient(
            { ...s, patients: { ...s.patients, [patient.id]: patient } }, apptId, patient.id, identity),
          async (m) => {
            await m.mirrorCreatePatient(patient);
            await m.mirrorLinkAppointmentPatient(apptId, patient.id);
          },
        );
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
        const { state: next, form } = backend.recordSignedForm(state, input, identity, writeNow());
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
      clinics: () => backend.clinicDirectoryList(state),
      clinicByID: (id) => state.clinicsByID[id] ?? null,
      relationshipAuditFor: (relationshipID) => backend.relationshipAuditForRelationship(state, relationshipID),
      setCooperationRelationship: (input, actor) => {
        // Eager-validate (throws before the async live branch); relationships are demo-writable.
        const next = backend.setCooperationRelationship(state, input, actor, writeNow());
        if (!live) { setState(() => next); return; }
        runLiveWrite(async () => {
          try { const m = await import("@/lib/firebase/mirror"); await m.mirrorSetCooperationRelationship(input); setRefreshTick((t) => t + 1); }
          catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      removeCooperationRelationship: (relationshipID, actor) => {
        const next = backend.removeCooperationRelationship(state, relationshipID, actor, writeNow());
        if (!live) { setState(() => next); return; }
        runLiveWrite(async () => {
          try { const m = await import("@/lib/firebase/mirror"); await m.mirrorRemoveCooperationRelationship(relationshipID); setRefreshTick((t) => t + 1); }
          catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      clinicEmployments: () => backend.clinicEmploymentsList(state),
      setClinicEmployment: (input, actor) => {
        // Eager-validate + apply (throws before the async live branch); demo-writable.
        const next = backend.setClinicEmployment(state, input, actor, writeNow());
        if (!live) { setState(() => next); return; }
        runLiveWrite(async () => {
          try {
            const m = await import("@/lib/firebase/mirror");
            await m.mirrorSetClinicMembership(input);
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      catalogProducts: () => backend.catalogProductsList(state),
      setProduct: (input, actor) => {
        // Eager-validate (throws before the async live branch); catalog is demo-writable.
        const next = backend.setProduct(state, input, actor);
        if (!live) { setState(() => next); return; }
        runLiveWrite(async () => {
          try { const m = await import("@/lib/firebase/mirror"); await m.mirrorSetProduct(input); setRefreshTick((t) => t + 1); }
          catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      setProductActive: (id, isActive, actor) => {
        const next = backend.setProductActive(state, id, isActive, actor);
        if (!live) { setState(() => next); return; }
        // Live: deactivate → the deactivateProduct callable; reactivate → setProduct(isActive:true)
        // with the stored fields (there is no reactivate callable — setProduct is the upsert path).
        const prod = state.productsByID[id];
        runLiveWrite(async () => {
          try {
            const m = await import("@/lib/firebase/mirror");
            if (isActive && prod) await m.mirrorSetProduct({ id: prod.id, category: prod.category, brand: prod.brand, name: prod.name, unit: prod.unit, isActive: true });
            else await m.mirrorDeactivateProduct(id);
            setRefreshTick((t) => t + 1);
          } catch (e) { setLastSyncError(syncErrorMessage(e)); }
        });
      },
      businessEntities: () => backend.businessEntitiesList(state),
      setBusinessEntity: async (input, actor) => {
        // Eager-validate (throws before the async live branch); entities are demo-writable.
        const next = backend.setBusinessEntity(state, input, actor);
        if (!live) { setState(() => next); return; }
        // AWAIT the callable and rethrow on failure so the edit form can show the real error.
        // Previously this was fire-and-forget: a rejected write only set the sync-error banner,
        // so the form closed as if it saved and the change silently never persisted (22/07
        // feedback: admin edits an account, no error, still old after refresh).
        try {
          const m = await import("@/lib/firebase/mirror");
          await m.mirrorSetBusinessEntity(input);
          setRefreshTick((t) => t + 1);
        } catch (e) { setLastSyncError(syncErrorMessage(e)); throw e; }
      },
      setBusinessEntityActive: async (id, isActive, actor) => {
        const next = backend.setBusinessEntityActive(state, id, isActive, actor);
        if (!live) { setState(() => next); return; }
        // Live: deactivate → the deactivateBusinessEntity callable; reactivate → setBusinessEntity
        // (isActive:true) with the stored fields (there is no reactivate callable — setBusinessEntity
        // is the upsert path). Awaited + rethrown so the row surfaces a failed toggle.
        const entity = state.businessEntitiesByID[id];
        try {
          const m = await import("@/lib/firebase/mirror");
          if (isActive && entity) await m.mirrorSetBusinessEntity({ id: entity.id, type: entity.type, legalName: entity.legalName, tradingName: entity.tradingName, abn: entity.abn, isActive: true });
          else await m.mirrorDeactivateBusinessEntity(id);
          setRefreshTick((t) => t + 1);
        } catch (e) { setLastSyncError(syncErrorMessage(e)); throw e; }
      },
      auditLog: () => backend.auditLogEntries(state),
      recordAdminAccess: (patient, identity) => {
        // Uses a live clock (not the frozen session `now`) so each access gets its true time —
        // per-event accuracy is the whole point of an audit trail. Demo → in-session state write;
        // live → also mirror to the durable `auditLog` collection via the superAdmin-only callable
        // (§21). Only a superAdmin's access is logged (the callable + the backend apply agree);
        // the apply is a no-op for anyone else, so the mirror is skipped too.
        const at = Date.now();
        applyAndMirror(
          (s) => backend.recordAdminPatientAccess(s, identity, patient, at),
          (m) => identity.role === "superAdmin" ? m.mirrorRecordAdminAccess(patient.id, fullName(patient)) : Promise.resolve(),
        );
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
    [state, now, writeNow, status, refreshing, pendingWrites, lastSyncError, applyAndMirror, runLiveWrite, live, formSubmissions, dropFormSubmission],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDemoStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDemoStore must be used within DemoStoreProvider");
  return ctx;
}
