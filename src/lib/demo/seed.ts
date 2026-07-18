// Port of SessionState.demoBackend — the same demo data the iOS app seeds.
// Built by replaying domain operations so seeded state obeys the same rules.
import type { CooperationRelationship, DemoState, FollowUpTask, Identity, MedicationItem, Note, Patient } from "./types";
import { LUMIERE, DEMO_ACCOUNTS } from "./accounts";
import { PRODUCT_CATALOG } from "./catalog";
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

/**
 * Clock for demo WRITES. Reads (expiry, "today") still use SEED_NOW — but stamping writes with
 * it too made them tie with the seed, and since Array#sort is stable the seed (inserted first)
 * won every newest-first tie-break: a record you just created rendered BELOW the sample data.
 * Each call returns a strictly increasing stamp just past SEED_NOW, so writes sort newest-first
 * and keep their creation order, while staying well inside SEED_NOW's own day — the demo's
 * frozen "today" and its TODAY_ISO-keyed appointments are unaffected.
 * Per-provider (not module state) so a remount — e.g. flipping between sandbox and live —
 * restarts cleanly alongside the freshly rebuilt seed.
 */
export function createDemoWriteClock(): () => number {
  let sequence = 0;
  return () => SEED_NOW + ++sequence;
}

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
    openReviewerDoctorIDs: [],
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
  route: "intramuscular",
  timing: "PRN monthly, max 6 treatments yearly (6 months in NSW)",
};
const voluma: MedicationItem = {
  name: "Voluma",
  dosage: "2",
  category: "haFiller",
  brand: "Juvederm",
  unit: "millilitres",
  areas: ["Cheek", "Chin"],
  route: "supraPeriosteal",
};
const profhilo: MedicationItem = {
  name: "Profhilo",
  dosage: "2",
  category: "skinBooster",
  unit: "millilitres",
  areas: ["Full Face"],
  // The request form has required a route per line item since round 6; a seeded item without
  // one describes a state the app can no longer produce (and hides the capture-dialog fallback).
  route: "subdermal",
};

export function buildSeedState(): DemoState {
  seq = 0;
  let state = emptyState();
  // Tier 3 #5B: seed the demo catalog from the static list so the admin editor has a real dataset
  // (live hydrates productsByID from Firestore instead). Selection still works via effectiveCatalog.
  state = { ...state, productsByID: Object.fromEntries(PRODUCT_CATALOG.map((p) => [p.id, p])) };

  // Round 6: premises of administration for the independent nurse (drives the dashboard
  // premise switcher + request stamping) and the demo doctor's contact/principal place
  // (prefills the Clause 68C direction). Seeded BEFORE the request replays below so
  // Sarah's independent requests carry her active premise stamp, like live submissions.
  state = { ...state, profileByUser: {
    "u-sarah": {
      ahpra: "", abn: "", phone: "", address: "", principalPlace: "",
      premises: [
        { id: "prem-sarah-bondi", name: "Sarah Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" },
        { id: "prem-sarah-surry", name: "The Skin Room", address: "3/21 Crown St, Surry Hills NSW 2010" },
      ],
      defaultPremiseId: "prem-sarah-bondi",
      selectedPremiseId: "prem-sarah-bondi",
    },
    "u-voss": {
      ahpra: "", abn: "", phone: "02 9388 4410", address: "",
      principalPlace: "A. Voss Medical, 88 Oxford St, Paddington NSW 2021",
      premises: [],
    },
  } };

  // Tier 3 #4: seed demo business entities so the admin editor has a real dataset (live hydrates
  // businessEntitiesByID from Firestore). The clinic starts with a BLANK ABN — the exact gap the
  // editor fills (a clinic-billed tax invoice needs the clinic's ABN); the doctor issuer has one.
  state = { ...state, businessEntitiesByID: {
    [LUMIERE.id]: { id: LUMIERE.id, type: "clinic", legalName: "Lumière Clinic Pty Ltd", tradingName: "Lumière", abn: "", isActive: true },
    "u-voss": { id: "u-voss", type: "independentDoctor", legalName: "Voss Aesthetics", abn: "51824753556", isActive: true },
  } };

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
    // bookedByID: the clinic booked this teleconsult — drives the round-6 chip title
    // "Lumière Clinic – Mara Boyd – teleconsult" and the upcoming-calls requester line.
    { id: "appt-1", type: "authSlot" as const, ownerID: "u-voss", bookedByID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 540, endMinute: 570, status: "confirmed" as const, patientID: amara.id, patientName: "Mara Boyd", appointmentNote: "Antiwrinkle" },
    { id: "appt-2", type: "treatment" as const, ownerID: "u-voss", dateISO: TODAY_ISO, startMinute: 600, endMinute: 630, status: "confirmed" as const, patientID: claire.id, patientName: "Coco Donovan", appointmentNote: "HA filler review" },
    { id: "appt-3", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 570, endMinute: 615, status: "confirmed" as const, patientID: amara.id, patientName: "Mara Boyd", appointmentNote: "Antiwrinkle review" },
    { id: "appt-4", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 630, endMinute: 660, status: "completed" as const, patientID: claire.id, patientName: "Coco Donovan", appointmentNote: "Profhilo" },
    { id: "appt-5", type: "treatment" as const, ownerID: LUMIERE.id, dateISO: TODAY_ISO, startMinute: 720, endMinute: 780, status: "confirmed" as const, appointmentNote: "Lunch — clinic closed" },
    // Google-ingested bookings (google-calendar-realtime-ingest): one auto-linked by a
    // unique email match, one still a lead — so the "· Google" chip mark, the detail
    // line, and the lead-linking flow are all demoable offline.
    { id: "appt-6", type: "treatment" as const, ownerID: "u-voss", dateISO: TODAY_ISO, startMinute: 660, endMinute: 690, status: "confirmed" as const, patientID: grace.id, patientName: "Grace Huang", appointmentNote: "Skin consult — booked online", source: "google" as const, externalCalendarRef: { provider: "google" as const, eventId: "gevt-seed-1" } },
    { id: "appt-7", type: "treatment" as const, ownerID: "u-voss", dateISO: TODAY_ISO, startMinute: 780, endMinute: 810, status: "confirmed" as const, lead: { givenName: "Noah", lastName: "Pratt", email: "noah.pratt@mail.com" }, appointmentNote: "New patient consult", source: "google" as const, externalCalendarRef: { provider: "google" as const, eventId: "gevt-seed-2" } },
  ];
  const appointments = { ...state.appointments };
  for (const a of appts) appointments[a.id] = a;
  state = { ...state, appointments };

  // A published authorisation-availability window for Dr Voss (14:00–15:00 → six 10-min slots),
  // so nurses can demo booking an open auth slot.
  const availID = "avail-seed-voss";
  state = {
    ...state,
    availabilityWindows: {
      [availID]: { id: availID, doctorID: "u-voss", doctorName: "Dr Elena Voss", dateISO: TODAY_ISO, startMinute: 840, endMinute: 900 },
    },
  };

  // Treatment schedule for Dr Voss: Mon–Fri 09:00–17:00, Sat/Sun closed,
  // plus one sample block today at 15:30–16:00 so the Treatment tab shows realistic data.
  state = {
    ...state,
    treatmentAvailabilityByOwner: {
      "u-voss": {
        ownerID: "u-voss",
        days: [
          { open: true, openMinute: 540, closeMinute: 1020 }, // Mon
          { open: true, openMinute: 540, closeMinute: 1020 }, // Tue
          { open: true, openMinute: 540, closeMinute: 1020 }, // Wed
          { open: true, openMinute: 540, closeMinute: 1020 }, // Thu
          { open: true, openMinute: 540, closeMinute: 1020 }, // Fri
          { open: false, openMinute: 540, closeMinute: 1020 }, // Sat
          { open: false, openMinute: 540, closeMinute: 1020 }, // Sun
        ],
        blocks: [{ id: "block-seed-1", dateISO: TODAY_ISO, startMinute: 930, endMinute: 960 }], // 15:30–16:00
      },
    },
  };

  // One pending follow-up due today so the calendar surfacing is demonstrable
  // (a freshly generated task is due +interval, so it would not show on "today").
  const seededFollowUp: FollowUpTask = {
    id: "fu-seed-1", ownerID: "u-voss", patientID: grace.id, patientName: "Grace Huang",
    dueDateISO: TODAY_ISO, status: "pending",
  };
  state = { ...state, followUpTasksByID: { ...state.followUpTasksByID, [seededFollowUp.id]: seededFollowUp } };

  // Self-booking demo data: a stable link token + one pending booking on a future date.
  const pendingBooking = {
    id: "appt-pending-1", type: "treatment" as const, ownerID: "u-voss", dateISO: "2026-07-03",
    startMinute: 600, endMinute: 630, status: "awaitingConfirmation" as const,
    lead: { givenName: "Jordan", lastName: "Lee", dob: "1994-08-02", phone: "0400 555 111", email: "jordan.lee@example.com" },
    appointmentNote: "Consultation",
  };
  state = {
    ...state,
    appointments: { ...state.appointments, [pendingBooking.id]: pendingBooking },
    bookingTokensByUser: { ...state.bookingTokensByUser, "u-voss": "bk-seed-voss" },
  };

  // A failed aftercare send so the delivery badge + Retry are demonstrable.
  const failedAftercare: Note = {
    id: "n-aftercare-failed", patientID: amara.id, kind: "aftercareRecord", title: "Aftercare sent",
    body: "— ANTIWRINKLE —\nAvoid touching or massaging the treated area for 4 hours. Stay upright for 4 hours.",
    createdAt: SEED_NOW, authorID: "u-voss", authorBadge: "Dr Elena Voss",
    consumedAuthorisationIDs: [], medications: [], deliveryStatus: "failed", aftercareCategories: ["antiwrinkle"],
    // Shaped like a real mailDelivery failureReason ("provider {status}: {body}") so the demo
    // shows the reason line, not just the badge.
    failureReason: "provider 422: recipient mailbox is full",
  };
  state = {
    ...state,
    notesByPatient: { ...state.notesByPatient, [amara.id]: [...(state.notesByPatient[amara.id] ?? []), failedAftercare] },
  };

  // A note with photo + file attachments so the thumbnail strip and rename-able file
  // chip are demonstrable (1×1 PNG data-urls — the demo has no Storage).
  const photoNote: Note = {
    id: "n-photos-seed", patientID: amara.id, kind: "general", title: "Treatment area photos",
    body: "Baseline photos before the next antiwrinkle cycle.",
    createdAt: SEED_NOW - 3 * 60 * 60 * 1000, authorID: "u-voss", authorBadge: "Dr Elena Voss",
    consumedAuthorisationIDs: [], medications: [],
    attachments: [
      { fileID: `patients/${amara.id}/photos/seed-before-l.png`, displayName: "before-left.png", mimeType: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4UlICAAOsAa2J5Of/AAAAAElFTkSuQmCC" },
      { fileID: `patients/${amara.id}/photos/seed-before-r.png`, displayName: "before-right.png", mimeType: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOomtICAAMeAZNlnyRkAAAAAElFTkSuQmCC" },
      { fileID: `patients/${amara.id}/files/seed-referral.pdf`, displayName: "GP referral.pdf", mimeType: "application/pdf" },
    ],
  };
  state = {
    ...state,
    notesByPatient: { ...state.notesByPatient, [amara.id]: [...(state.notesByPatient[amara.id] ?? []), photoNote] },
  };

  // Synced external-calendar busy times for Voss (as if syncGoogleCalendar ran): a
  // mid-day gym block and a dinner running past local midnight — instants + IANA zone,
  // exactly the wire shape of externalBusy/{ownerId}. AEST = UTC+10 on these dates.
  state = {
    ...state,
    externalBusyByOwner: {
      "u-voss": {
        ownerID: "u-voss",
        timeZone: "Australia/Sydney",
        events: [
          { startISO: "2026-06-26T02:30:00Z", endISO: "2026-06-26T03:30:00Z", id: "seed-gym" },        // 12:30–13:30
          { startISO: "2026-06-26T09:00:00Z", endISO: "2026-06-26T15:00:00Z", id: "seed-dinner" },     // 19:00–01:00(+1)
        ],
      },
    },
  };

  // Super-admin console inventory: one record per demo account (roles deduped —
  // Sarah's independent + clinic identities are both "nurse"). The demo cast has
  // no sign-in emails, so email stays "".
  const accountsByID: DemoState["accountsByID"] = {};
  for (const account of DEMO_ACCOUNTS) {
    const { user } = account.identities[0];
    accountsByID[user.id] = {
      id: user.id,
      name: user.name,
      email: "",
      roles: [...new Set(account.identities.map((i) => i.role))],
      mustChangePassword: false,
    };
  }
  state = { ...state, accountsByID };

  // Cooperation relationships (spec 2026-07-08): seed the demo cast's active pairs so the gated
  // request pickers still show Dr Voss. Sarah acts independently (nurse counterparty) and
  // Ruby/Ava/Sarah act in Lumière (clinic counterparty) — cover both.
  const rel = (counterpartyType: "nurse" | "clinic", counterpartyID: string, counterpartyName: string): CooperationRelationship => ({
    id: `u-voss_${counterpartyType}_${counterpartyID}`,
    doctorID: "u-voss", doctorName: "Dr Elena Voss",
    counterpartyType, counterpartyID, counterpartyName,
    status: "active", authRequestsAllowed: true, invoiceApplies: true, priceCentsOverride: null,
    createdAt: SEED_NOW, updatedAt: SEED_NOW,
  });
  const cooperationRelationshipsByID: DemoState["cooperationRelationshipsByID"] = {};
  for (const r of [rel("nurse", "u-sarah", "Sarah Chen"), rel("clinic", "clinic-lumiere", "Lumière Clinic")]) {
    cooperationRelationshipsByID[r.id] = r;
  }
  state = { ...state, cooperationRelationshipsByID };

  return state;
}
