"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DemoState, Identity, MedicationItem, TreatmentMedication } from "./types";
import { buildSeedState, SEED_NOW } from "./seed";
import * as backend from "./backend";

interface StoreValue {
  state: DemoState;
  now: number;
  // Reads
  searchPatients: (query: string, identity: Identity) => ReturnType<typeof backend.searchPatients>;
  notesForPatient: (patientID: string) => ReturnType<typeof backend.notesForPatient>;
  activeAuthorisations: (patientID: string) => ReturnType<typeof backend.activeAuthorisations>;
  pendingRequestsForDoctor: (doctorID: string) => ReturnType<typeof backend.pendingRequestsForDoctor>;
  openRequestsForPatient: (patientID: string, nurseID: string) => ReturnType<typeof backend.openRequestsForPatient>;
  // Writes
  submitRequest: (input: { patientID: string; doctorID: string; items: MedicationItem[]; identity: Identity }) => void;
  approveRequest: (requestID: string, identity: Identity) => void;
  requireEdit: (requestID: string, identity: Identity) => void;
  saveGeneralNote: (input: { patientID: string; title: string; body: string; identity: Identity }) => void;
  saveTreatmentNote: (input: { patientID: string; tickedIDs: string[]; title: string; body: string; medications: TreatmentMedication[]; identity: Identity }) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  // Built once per mount; a hard reload remounts and resets to the seed.
  const [state, setState] = useState<DemoState>(() => buildSeedState());
  const now = SEED_NOW; // keeps seeded expiries "active"

  const value = useMemo<StoreValue>(
    () => ({
      state,
      now,
      searchPatients: (query, identity) => backend.searchPatients(state, query, identity),
      notesForPatient: (patientID) => backend.notesForPatient(state, patientID),
      activeAuthorisations: (patientID) => backend.activeAuthorisations(state, patientID, now),
      pendingRequestsForDoctor: (doctorID) => backend.pendingRequestsForDoctor(state, doctorID),
      openRequestsForPatient: (patientID, nurseID) => backend.openRequestsForPatient(state, patientID, nurseID),
      submitRequest: (input) => setState((s) => backend.submitRequest(s, input, now).state),
      approveRequest: (requestID, identity) => setState((s) => backend.approveRequest(s, requestID, identity, now).state),
      requireEdit: (requestID, identity) => setState((s) => backend.requireEdit(s, requestID, identity)),
      saveGeneralNote: (input) => setState((s) => backend.saveGeneralNote(s, input, now).state),
      saveTreatmentNote: (input) => setState((s) => backend.saveTreatmentNote(s, input, now).state),
    }),
    [state, now],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useDemoStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useDemoStore must be used within DemoStoreProvider");
  return ctx;
}
