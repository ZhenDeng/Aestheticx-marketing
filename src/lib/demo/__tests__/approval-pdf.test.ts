// Combined Treatment Authorisation at approval (round 6): model assembly vectors mirror
// the backend's authorisationPdf tests (wire truth); the demo approveRequest writes the
// note, live mode must not.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMING,
  MISSING_VALUE,
  approvalNote,
  approvalNoteId,
  approvalPdfPath,
  approvalRows,
  buildApprovalDocumentModel,
  bytesToBase64,
  dosageWithUnit,
  formatDay,
  renderApprovalPdf,
  type ApprovalModelInput,
} from "@/lib/demo/approvalPdf";
import { approveRequest, notesForPatient, submitRequest, updateProfile } from "@/lib/demo/backend";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { Identity, MedicationItem } from "@/lib/demo/types";

const botox: MedicationItem = {
  name: "Botox", dosage: "48", category: "neurotoxin", unit: "units", areas: ["Glabella", "Forehead"],
  route: "intramuscular",
};
const voluma: MedicationItem = {
  name: "Voluma", brand: "Juvederm", dosage: "2", category: "haFiller", unit: "millilitres", areas: ["Cheek"],
  route: "supraPeriosteal", timing: "Single session",
};

const sarahIndependent: Identity = DEMO_ACCOUNTS[0].identities[0];
const sarahClinic: Identity = DEMO_ACCOUNTS[0].identities[1];
const voss: Identity = DEMO_ACCOUNTS[2].identities[0];

const APPROVED = Date.UTC(2026, 6, 13, 2, 0); // 13 Jul 2026 in Sydney
const EXPIRES = Date.UTC(2027, 0, 13, 2, 0);

function modelInput(over: Partial<ApprovalModelInput> = {}): ApprovalModelInput {
  return {
    requestId: "req-7",
    request: {
      items: [botox, voluma],
      premise: { id: "prem-1", name: "Sarah Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" },
      nurseName: "Sarah Chen",
      clinicId: null,
    },
    approvedAtMillis: APPROVED,
    expiresAtMillis: EXPIRES,
    prescriber: { name: "Dr Elena Voss", phone: "02 9388 4410", principalPlace: "88 Oxford St", prescriberNumber: "MED0001" },
    clinic: null,
    patient: { name: "Amara Boyd", address: "14 Marra St", dobText: "12/3/1991", allergies: "Penicillin" },
    emergencyRefs: [{ kind: "adrenaline", expiresAtMillis: Date.UTC(2027, 6, 13) }],
    ...over,
  };
}

describe("display helpers", () => {
  it("suffixes dosage with the unit label, never doubling", () => {
    expect(dosageWithUnit(botox)).toBe("48 U");
    expect(dosageWithUnit(voluma)).toBe("2 mls");
    expect(dosageWithUnit({ ...voluma, dosage: "2 mls" })).toBe("2 mls");
    expect(dosageWithUnit({ ...botox, unit: "freeText", dosage: "" })).toBe(MISSING_VALUE);
    // Legacy pre-round-6 spellings already on the stored dosage never double up.
    expect(dosageWithUnit({ ...voluma, dosage: "2 mL" })).toBe("2 mL");
    expect(dosageWithUnit({ ...voluma, dosage: "2 millilitres" })).toBe("2 millilitres");
  });
  it("formats dd/MM/yyyy in Sydney time", () => {
    expect(formatDay(APPROVED)).toBe("13/07/2026");
    // 22:00 UTC is the next Sydney day.
    expect(formatDay(Date.UTC(2026, 5, 17, 22, 0))).toBe("18/06/2026");
  });
  it("uses the 19/07 owner wording for the default timing", () => {
    expect(DEFAULT_TIMING).toBe("PRN, max 5 treatments, expire after 6 months");
  });
});

describe("approvalRows", () => {
  it("builds one row per medication with brand, category, areas, volume, timing, route", () => {
    const rows = approvalRows([botox, voluma]);
    expect(rows[0]).toEqual({
      product: "Botox", category: "Neurotoxin", areas: "Glabella, Forehead",
      volume: "48 U", timing: DEFAULT_TIMING, route: "Intramuscular",
    });
    expect(rows[1]).toEqual({
      product: "Juvederm Voluma", category: "HA Filler", areas: "Cheek",
      volume: "2 mls", timing: "Single session", route: "Supra-periosteal",
    });
  });
  it("prints em dashes for legacy items without route/areas and hides the other category", () => {
    const rows = approvalRows([{ name: "Compounded X", dosage: "1", category: "other", unit: "freeText", areas: [] }]);
    expect(rows[0].route).toBe(MISSING_VALUE);
    expect(rows[0].areas).toBe(MISSING_VALUE);
    expect(rows[0].category).toBeNull();
  });
});

describe("buildApprovalDocumentModel", () => {
  it("uses the stamped premise for independent requests", () => {
    const model = buildApprovalDocumentModel(modelInput());
    expect(model.premisesOfAdministration).toBe("Sarah Chen Aesthetics, 12 Hall St, Bondi Beach NSW 2026");
    expect(model.headerName).toBe("Dr Elena Voss");
    expect(model.reviewedOnText).toBe("13/07/2026");
    expect(model.effectiveOnText).toBe("13/07/2026");
    expect(model.expiresOnText).toBe("13/01/2027");
    expect(model.emergencyReferences).toEqual([{ label: "Adrenaline — anaphylaxis", expiresText: "13/07/2027" }]);
  });
  it("ALWAYS uses the clinic address for clinic-context requests (even with a stamp)", () => {
    const model = buildApprovalDocumentModel(modelInput({
      request: { ...modelInput().request, clinicId: "clinic-lumiere" },
      clinic: { name: "Lumière Clinic", address: "2 Notts Ave, Bondi Beach NSW 2026" },
    }));
    expect(model.premisesOfAdministration).toBe("Lumière Clinic, 2 Notts Ave, Bondi Beach NSW 2026");
    expect(model.headerName).toBe("Lumière Clinic");
  });
  it("prints an em dash for legacy requests with no premise, and never fabricates data", () => {
    const model = buildApprovalDocumentModel(modelInput({
      request: { ...modelInput().request, premise: null },
      prescriber: { name: "Dr Elena Voss" },
      patient: {},
    }));
    expect(model.premisesOfAdministration).toBe(MISSING_VALUE);
    expect(model.prescriberPhone).toBe(MISSING_VALUE);
    expect(model.patientDOB).toBe(MISSING_VALUE);
    expect(model.allergies).toBe("None");
  });
});

describe("renderApprovalPdf", () => {
  it("produces a parseable PDF whose text stream carries every section", () => {
    const bytes = renderApprovalPdf(buildApprovalDocumentModel(modelInput()));
    const file = new TextDecoder("latin1").decode(bytes);
    expect(file.startsWith("%PDF-1.4")).toBe(true);
    for (const needle of [
      "TREATMENT AUTHORISATION", "REQ-7", "AUTHORISATION TO TREAT",
      "Juvederm Voluma", "2 mls", "Supra-periosteal",
      "PREMISES OF ADMINISTRATION", "Sarah Chen Aesthetics, 12 Hall St, Bondi Beach NSW 2026",
      "STANDING EMERGENCY AUTHORISATIONS", "Electronically authorised on 13/07/2026",
      "Prescriber Number MED0001",
    ]) {
      expect(file).toContain(needle);
    }
  });
  it("no longer prints the removed sections and fields (19/07 feedback)", () => {
    const bytes = renderApprovalPdf(buildApprovalDocumentModel(modelInput()));
    const file = new TextDecoder("latin1").decode(bytes);
    for (const gone of [
      "PER ADMINISTRATION",           // recording section heading + instruction
      "DIRECTION UNDER CLAUSE 68C",   // Clause 68C section heading
      "PRESCRIBER)",                  // the PRESCRIBER field label (paren-delimited in the stream)
      "PRINCIPAL PLACE OF PRACTICE",
      "PERIOD DIRECTION HAS EFFECT",
      "ADMINISTRATIONS",              // the Administrations field label
    ]) {
      expect(file).not.toContain(gone);
    }
    // The signature block still carries the prescriber contact lines.
    expect(file).toContain("p: 02 9388 4410");
    expect(file).toContain("a: 88 Oxford St");
  });
});

describe("approval note factory (wire parity with the Cloud Function's approvalNoteDoc)", () => {
  it("builds the deterministic treatment note with the PDF attached", () => {
    const note = approvalNote({
      patientId: "p1", requestId: "req-7", doctorId: "u-voss", doctorName: "Dr Elena Voss",
      approvedAtMillis: APPROVED, pdf: Uint8Array.from([1, 2, 3]),
    });
    expect(note.id).toBe("authpdf-req-7");
    expect(approvalNoteId("req-7")).toBe("authpdf-req-7");
    expect(note.kind).toBe("treatment");
    expect(note.title).toBe("Treatment authorisation — 13 Jul 2026");
    expect(note.consumedAuthorisationIDs).toEqual([]); // the audit note never consumes repeats
    expect(note.authorID).toBe("u-voss");
    expect(note.authorBadge).toBe("Dr Elena Voss");
    expect(note.attachments).toEqual([{
      fileID: approvalPdfPath("p1", "req-7"),
      displayName: "Treatment authorisation — 13 Jul 2026.pdf",
      mimeType: "application/pdf",
      dataUrl: `data:application/pdf;base64,${bytesToBase64(Uint8Array.from([1, 2, 3]))}`,
    }]);
    expect(approvalPdfPath("p1", "req-7")).toBe("patients/p1/authorisations/req-7.pdf");
  });
  it("encodes base64 with correct padding", () => {
    expect(bytesToBase64(new TextEncoder().encode("Ma"))).toBe("TWE=");
    expect(bytesToBase64(new TextEncoder().encode("Man"))).toBe("TWFu");
    expect(bytesToBase64(new TextEncoder().encode("M"))).toBe("TQ==");
  });
});

describe("demo approveRequest writes the approval note", () => {
  function ownPatientId(state: ReturnType<typeof buildSeedState>, identity: Identity): string {
    const p = Object.values(state.patients).find((x) =>
      identity.context.kind === "independent"
        ? x.owner.kind === "nurse" && x.owner.id === identity.user.id
        : x.owner.kind === "clinic");
    if (!p) throw new Error("no seed patient");
    return p.id;
  }

  it("attaches ONE combined PDF note per approval (all items, treatment-note stream)", () => {
    let state = buildSeedState();
    state = updateProfile(state, sarahIndependent.user.id, {
      premises: [{ id: "prem-1", name: "Sarah Chen Aesthetics", address: "12 Hall St" }],
      defaultPremiseId: "prem-1", selectedPremiseId: "prem-1",
    });
    const pid = ownPatientId(state, sarahIndependent);
    const submitted = submitRequest(state, { patientID: pid, doctorID: voss.user.id, items: [botox, voluma], identity: sarahIndependent }, SEED_NOW);
    const { state: approved } = approveRequest(submitted.state, submitted.request.id, voss, APPROVED);
    const notes = notesForPatient(approved, pid);
    const note = notes.find((n) => n.id === approvalNoteId(submitted.request.id));
    expect(note).toBeDefined();
    expect(note?.kind).toBe("treatment");
    expect(note?.attachments).toHaveLength(1); // ONE file for the whole request, not per item
    expect(note?.attachments?.[0].mimeType).toBe("application/pdf");
    const pdfText = new TextDecoder("latin1").decode(
      Uint8Array.from(atob(note!.attachments![0].dataUrl!.split(",")[1]), (c) => c.charCodeAt(0)),
    );
    expect(pdfText).toContain("Botox");
    expect(pdfText).toContain("Juvederm Voluma");
    expect(pdfText).toContain("Sarah Chen Aesthetics, 12 Hall St");
  });

  it("uses the clinic address on clinic-context approvals", () => {
    const state = buildSeedState();
    const pid = ownPatientId(state, sarahClinic);
    const submitted = submitRequest(state, { patientID: pid, doctorID: voss.user.id, items: [botox], identity: sarahClinic }, SEED_NOW);
    const { state: approved } = approveRequest(submitted.state, submitted.request.id, voss, APPROVED);
    const note = notesForPatient(approved, pid).find((n) => n.id === approvalNoteId(submitted.request.id));
    const pdfText = new TextDecoder("latin1").decode(
      Uint8Array.from(atob(note!.attachments![0].dataUrl!.split(",")[1]), (c) => c.charCodeAt(0)),
    );
    expect(pdfText).toContain("2 Notts Ave, Bondi Beach NSW 2026");
  });

  it("skips the note in live mode (the Cloud Function owns the artifact)", () => {
    const state = buildSeedState();
    const pid = ownPatientId(state, sarahIndependent);
    const submitted = submitRequest(state, { patientID: pid, doctorID: voss.user.id, items: [botox], identity: sarahIndependent }, SEED_NOW);
    const { state: approved } = approveRequest(submitted.state, submitted.request.id, voss, APPROVED, {
      generateEmergency: false, recordAudit: false, generateApprovalNote: false,
    });
    expect(notesForPatient(approved, pid).some((n) => n.id === approvalNoteId(submitted.request.id))).toBe(false);
  });
});
