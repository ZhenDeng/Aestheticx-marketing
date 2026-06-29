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
          setLastSyncError(String(e));
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
      billingSummary: (id) => billing.billingSummary(state.ledger, id),
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
        let created: ReturnType<typeof backend.submitRequest>["request"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.submitRequest(s, input, now); created = r.request; return r.state; },
          (m) => created ? m.mirrorCreateRequest(created) : Promise.resolve(),
        );
      },
      approveRequest: (requestID, id) =>
        applyAndMirror((s) => backend.approveRequest(s, requestID, id, now).state, (m) => m.mirrorApproveRequest(requestID)),
      requireEdit: (requestID, id) =>
        applyAndMirror((s) => backend.requireEdit(s, requestID, id), (m) => m.mirrorRequireEdit(requestID)),
      saveGeneralNote: (input) => {
        let note: ReturnType<typeof backend.saveGeneralNote>["note"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.saveGeneralNote(s, input, now); note = r.note; return r.state; },
          (m) => note ? m.mirrorCreateNote(input.patientID, note) : Promise.resolve(),
        );
      },
      saveTreatmentNote: (input) => {
        let note: ReturnType<typeof backend.saveTreatmentNote>["note"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.saveTreatmentNote(s, input, now); note = r.note; return r.state; },
          async (m) => {
            if (input.tickedIDs.length) {
              await m.mirrorConsumeRepeats({
                patientId: input.patientID,
                clinicId: clinicId(input.identity),
                authorisationIds: input.tickedIDs,
                note: { title: input.title, body: input.body, medications: input.medications },
              });
            } else if (note) {
              await m.mirrorCreateNote(input.patientID, note);
            }
          },
        );
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
            catch (e) { setLastSyncError(String(e)); }
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
        let form: ReturnType<typeof backend.recordSignedForm>["form"] | null = null;
        applyAndMirror(
          (s) => { const r = backend.recordSignedForm(s, input, identity, now); form = r.form; return r.state; },
          (m) => (form ? m.mirrorCreateForm(form) : Promise.resolve()),
        );
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
