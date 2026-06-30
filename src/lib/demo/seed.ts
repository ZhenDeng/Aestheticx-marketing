// Port of SessionState.demoBackend — the same demo data the iOS app seeds.
// Built by replaying domain operations so seeded state obeys the same rules.
import type { DemoState, FollowUpTask, Identity, MedicationItem, Patient } from "./types";
import { LUMIERE, DEMO_ACCOUNTS } from "./accounts";
import {
  emptyState,
  submitRequest,
  approveRequest,
  saveTreatmentNote,
  saveGeneralNote,
  isoDay,
} from "./backend";

// Fixed demo "today" so seeded appointments and expiries are deterministic.
export const SEED_NOW = Date.UTC(2026, 5, 26, 0, 0, 0);
const TODAY_ISO = isoDay(SEED_NOW); // stays in sync with SEED_NOW

const sarahIndependent: Identity = DEMO_ACCOUNTS[0].identities[0];
const sarahClinic: Identity = DEMO_ACCOUNTS[0].identities[1];
const voss: Identity = DEMO_ACCOUNTS[2].identities[0];

let seq = 0;
function pid(): string {
  seq += 1;
  return `p-${seq}`;
}

function makePatient(
  given: string,
  last: string,
  dob: { year: number; month: number; day: number },
  phone: string,
  allergies: string,
  meds: string,
  owner: Patient["owner"],
  preferred?: string,
  alert?: string,
): Patient {
  return {
    id: pid(),
    givenName: given,
    lastName: last,
    dateOfBirth: dob,
    gender: "Female",
    address: "7/22 Fitzroy St, St Kilda VIC 3182",
    phone,
    email: `${given.toLowerCase()}@example.com`,
    allergies,
    currentMedications: meds,
    owner,
    prescribingDoctorIDs: [],
    preferredName: preferred,
    alert,
  };
}

const letybo: MedicationItem = {
  name: "Letybo",
  dosage: "16",
  category: "neurotoxin",
  unit: "units",
  areas: ["Forehead", "Glabella"],
  timing: "PRN monthly, max 6 treatments yearly (6 months in NSW)",
};
const voluma: MedicationItem = {
  name: "Voluma",
  dosage: "2",
  category: "haFiller",
  brand: "Juvederm",
  unit: "millilitres",
  areas: ["Cheek", "Chin"],
};
const profhilo: MedicationItem = {
  name: "Profhilo",
  dosage: "2",
  category: "skinBooster",
  unit: "millilitres",
  areas: ["Full Face"],
};

export function buildSeedState(): DemoState {
  seq = 0;
  let state = emptyState();

  // Amara 'Mara' Boyd — clinic patient, full workflow + lignocaine alert.
  const amara = makePatient(
    "Amara", "Boyd", { year: 1991, month: 3, day: 12 }, "0401 223 871",
    "Lidocaine, Penicillin", "Levothyroxine 75µg daily",
    { kind: "clinic", id: LUMIERE.id }, "Mara",
    "Anaphylaxis to lignocaine — confirm anaesthetic-free product before any treatment.",
  );
  state = { ...state, patients: { ...state.patients, [amara.id]: amara } };

  const amaraReq = submitRequest(
    state, { patientID: amara.id, doctorID: "u-voss", items: [letybo, voluma], identity: sarahClinic }, SEED_NOW,
  );
  state = amaraReq.state;
  const amaraApproved = approveRequest(state, amaraReq.request.id, voss, SEED_NOW);
  state = amaraApproved.state;
  state = saveTreatmentNote(
    state,
    {
      patientID: amara.id,
      tickedIDs: [amaraApproved.granted[0].id],
      title: "Antiwrinkle — forehead & glabella, 16U",
      body: "Glabella 5-point pattern, frontalis 6-point. Tolerated well, ice applied.",
      medications: [{ name: "Letybo", batch: "C4815-A", expiry: "03/27", dosage: "16U" }],
      identity: sarahClinic,
    },
    SEED_NOW,
  ).state;
  state = saveGeneralNote(
    state,
    { patientID: amara.id, title: "", body: "Pt called re: mild bruising day 2, advised arnica and warm compress from day 3.", identity: sarahClinic },
    SEED_NOW,
  ).state;

  // Claire 'Coco' Donovan — Sarah's independent patient, pending Profhilo request.
  const claire = makePatient(
    "Claire", "Donovan", { year: 1987, month: 7, day: 4 }, "0432 901 343",
    "NKDA", "Nil", { kind: "nurse", id: "u-sarah" }, "Coco",
  );
  state = { ...state, patients: { ...state.patients, [claire.id]: claire } };
  state = submitRequest(
    state, { patientID: claire.id, doctorID: "u-voss", items: [profhilo], identity: sarahIndependent }, SEED_NOW,
  ).state;

  // Grace Huang — Dr Voss's private patient.
  const grace = makePatient(
    "Grace", "Huang", { year: 1979, month: 1, day: 17 }, "0488 130 224",
    "NKDA", "Perindopril 5mg", { kind: "doctor", id: "u-voss" },
  );
  state = { ...state, patients: { ...state.patients, [grace.id]: grace } };

  // Seeded appointments for today (clinic + doctor calendars).
  const appts = [
    { id: "appt-1", type: "authSlot" as const, ownerID: "u-voss", dateISO: TODAY_ISO, startMinute: 540, endMinute: 570, status: "confirmed" as const, patientID: amara.id, patientName: "Mara Boyd", appointmentNote: "Antiwrinkle" },
    { id: "appt-2", type: "treatment" as const, ownerID: "u-voss", dateISO: TODAY_ISO, startMinute: 600, endMinute: 630, status: "confirmed" as const, patientID: claire.id, patientName: "Coco Donovan", appointmentNote: "HA filler review" },
    { id: "appt-3", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 570, endMinute: 615, status: "confirmed" as const, patientID: amara.id, patientName: "Mara Boyd", appointmentNote: "Antiwrinkle review" },
    { id: "appt-4", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 630, endMinute: 660, status: "completed" as const, patientID: claire.id, patientName: "Coco Donovan", appointmentNote: "Profhilo" },
    { id: "appt-5", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 720, endMinute: 780, status: "confirmed" as const, appointmentNote: "Lunch — clinic closed" },
  ];
  const appointments = { ...state.appointments };
  for (const a of appts) appointments[a.id] = a;
  state = { ...state, appointments };

  // One pending follow-up due today so the calendar surfacing is demonstrable
  // (a freshly generated task is due +interval, so it would not show on "today").
  const seededFollowUp: FollowUpTask = {
    id: "fu-seed-1", ownerID: "u-voss", patientID: grace.id, patientName: "Grace Huang",
    dueDateISO: TODAY_ISO, status: "pending",
  };
  state = { ...state, followUpTasksByID: { ...state.followUpTasksByID, [seededFollowUp.id]: seededFollowUp } };

  return state;
}
