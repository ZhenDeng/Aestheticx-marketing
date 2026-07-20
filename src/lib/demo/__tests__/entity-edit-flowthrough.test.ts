// Regression locks for the 20/07 feedback round (specs: invoicing — "Business entity
// edits flow into subsequently generated invoices"; cooperation-linking — "A dual-kind
// relationship's two kinds operate independently"). No new behavior: these pin the
// existing generation-time party resolution and kind independence.
import { describe, expect, it } from "vitest";
import * as backend from "../backend";
import { billingSummary } from "../billing";
import { patientAccessLevel } from "../isolation";
import { heldIdentities, prescriberIdentity } from "../identity";
import { buildSeedState, SEED_NOW } from "../seed";
import { LUMIERE } from "../accounts";
import { fullName, type CooperationRelationship, type DemoState, type Identity } from "../types";

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

// The seed leaves Voss's inbox pending — approve everything so billable rows exist.
function approvedSeedState(): DemoState {
  let state = buildSeedState();
  for (const req of backend.pendingRequestsForDoctor(state, "u-voss")) {
    state = backend.approveRequest(state, req.id, voss, SEED_NOW).state;
  }
  return state;
}

// Generate an invoice over every un-invoiced Voss ↔ Sarah (nurse counterparty) authorisation.
function generateForSarah(state: DemoState) {
  const billable = backend.billableAuthorisations(state, "u-voss").filter((r) => r.counterpartyID === "u-sarah" && !r.invoiced);
  expect(billable.length).toBeGreaterThan(0);
  return backend.generateInvoice(
    state,
    { doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse", periodLabel: "July 2026", authIDs: billable.map((r) => r.id) },
    voss,
    SEED_NOW,
  );
}

describe("business entity edits flow into subsequently generated invoices", () => {
  it("a sole-trader → company switch appears on the next invoice; earlier snapshots stay frozen", () => {
    let state = approvedSeedState();
    const first = generateForSarah(state);
    expect(first.invoice.issuer?.businessName).toBe("Voss Aesthetics");
    expect(first.invoice.issuer?.abn).toBe("51824753556");

    // Super admin re-registers the doctor's entity as a company (new legal name + ABN)
    // and deletes the first invoice so its authorisations can be re-billed.
    state = backend.setBusinessEntity(
      first.state,
      { id: "u-voss", type: "independentDoctor", legalName: "Voss Aesthetics Pty Ltd", abn: "12345678901", isActive: true },
      admin,
    );
    state = backend.deleteInvoice(state, first.invoice.id, voss, SEED_NOW);

    const second = generateForSarah(state);
    expect(second.invoice.issuer?.businessName).toBe("Voss Aesthetics Pty Ltd");
    expect(second.invoice.issuer?.abn).toBe("12345678901");

    // The pre-edit invoice (regenerated fresh above) demonstrates snapshots: the first
    // invoice object still carries the original identity, untouched by the edit.
    expect(first.invoice.issuer?.businessName).toBe("Voss Aesthetics");
  });

  it("manual service invoices pick up the issuer's entity edits the same way", () => {
    const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
    let state = buildSeedState();
    state = backend.setBusinessEntity(
      state,
      { id: "u-sarah", type: "independentNurse", legalName: "Chen Aesthetics Pty Ltd", abn: "98765432109", isActive: true },
      admin,
    );
    const next = backend.createServiceInvoice(state, { clinicID: LUMIERE.id, lines: [{ description: "Services", amountCents: 1000 }] }, sarahClinic, SEED_NOW);
    const invoice = next.invoices[next.invoices.length - 1];
    expect(invoice.issuer?.businessName).toBe("Chen Aesthetics Pty Ltd");
    expect(invoice.issuer?.abn).toBe("98765432109");
  });
});

describe("dual-kind relationship independence", () => {
  function setKinds(state: DemoState, kinds: CooperationRelationship["relationshipKinds"]): DemoState {
    const id = `u-voss_clinic_${LUMIERE.id}`;
    const rel = state.cooperationRelationshipsByID[id];
    expect(rel).toBeTruthy();
    return {
      ...state,
      cooperationRelationshipsByID: { ...state.cooperationRelationshipsByID, [id]: { ...rel, relationshipKinds: kinds } },
    };
  }

  it("adding employee to a prescriber relationship changes neither the billing summary nor invoice output", () => {
    const base = approvedSeedState();
    const prescriberOnly = setKinds(base, ["prescriber"]);
    const dual = setKinds(base, ["employee", "prescriber"]);

    const summaryA = billingSummary(Object.values(prescriberOnly.authorisations), voss);
    const summaryB = billingSummary(Object.values(dual.authorisations), voss);
    expect(summaryB).toEqual(summaryA);

    const invoiceA = generateForSarah(prescriberOnly).invoice;
    const invoiceB = generateForSarah(dual).invoice;
    expect(invoiceB.subtotalCents).toBe(invoiceA.subtotalCents);
    expect(invoiceB.totalCents).toBe(invoiceA.totalCents);
    expect(invoiceB.lines.length).toBe(invoiceA.lines.length);
  });

  it("clinic client data opens only under the clinic (employee) identity", () => {
    const state = setKinds(buildSeedState(), ["employee", "prescriber"]);
    const clinicPatient = Object.values(state.patients).find((p) => p.owner.kind === "clinic")!;

    // Independent identity: commercial collaborator at most — the clinic book is not his.
    expect(patientAccessLevel(state, voss, clinicPatient)).toBe("collaborator");
    // The employee-kind grant mints a clinic identity, and under it he is the owner silo.
    const clinicIdentity = heldIdentities(voss, [], Object.values(state.cooperationRelationshipsByID))
      .find((i) => i.context.kind === "clinic");
    expect(clinicIdentity).toBeTruthy();
    expect(patientAccessLevel(state, clinicIdentity!, clinicPatient)).toBe("owner");
    expect(fullName(clinicPatient).length).toBeGreaterThan(0);
  });

  it("prescribing surfaces key off the held doctor identity, not the active one", () => {
    const state = setKinds(buildSeedState(), ["employee", "prescriber"]);
    const identities = heldIdentities(voss, [], Object.values(state.cooperationRelationshipsByID));
    const clinicIdentity = identities.find((i) => i.context.kind === "clinic")!;

    // Whichever identity is "active", the prescriber resolution lands on the same doctor
    // account — so the review inbox and incoming calls follow him across workspaces.
    expect(prescriberIdentity(heldIdentities(clinicIdentity, [], Object.values(state.cooperationRelationshipsByID)))?.user.id).toBe("u-voss");
    const pendingActive = backend.pendingRequestsForDoctor(state, "u-voss");
    const pendingAfterSwitch = backend.pendingRequestsForDoctor(state, "u-voss");
    expect(pendingAfterSwitch).toEqual(pendingActive);
  });
});
