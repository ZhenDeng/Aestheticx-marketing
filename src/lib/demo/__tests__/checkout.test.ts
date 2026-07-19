// Client checkout: scenario routing + split billing (spec: client-checkout).
import { describe, expect, it } from "vitest";
import {
  BackendError, billableAuthorisations, checkoutClient, finalizeServiceFeeInvoice,
  topUpWallet, walletBalanceCents, DEFAULT_SERVICE_FEE_CENTS,
} from "../backend";
import { resolveInvoiceKind } from "../invoicing";
import { buildSeedState, SEED_NOW } from "../seed";
import { LUMIERE } from "../accounts";
import { fullName, ownerKeyOf, type DemoState, type Identity, type Patient } from "../types";

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const ruby: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const ava: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

function findPatient(state: DemoState, name: string): Patient {
  const p = Object.values(state.patients).find((x) => fullName(x) === name);
  if (!p) throw new Error(`seed patient ${name} missing`);
  return p;
}

describe("seeded price lists and service fees", () => {
  it("seeds a fee schedule for each demo silo", () => {
    const state = buildSeedState();
    expect(state.priceListByOwner["nurse:u-sarah"]?.length).toBeGreaterThan(0);
    expect(state.priceListByOwner["doctor:u-voss"]?.length).toBeGreaterThan(0);
    expect(state.priceListByOwner[`clinic:${LUMIERE.id}`]?.length).toBeGreaterThan(0);
    expect(state.serviceFeeCentsByPair[`${LUMIERE.id}_u-sarah`]).toBeGreaterThan(0);
  });
});

describe("checkoutClient — Scenario A (independent B2C)", () => {
  it("a nurse checking out her own client issues one client-sale invoice from her own price list", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const item = state.priceListByOwner["nurse:u-sarah"][0];
    const before = state.invoices.length;
    const next = checkoutClient(state, { patientID: claire.id, items: [{ itemID: item.id, qty: 1 }] }, sarahIndependent, SEED_NOW);

    expect(next.invoices.length).toBe(before + 1);
    const invoice = next.invoices[next.invoices.length - 1];
    expect(resolveInvoiceKind(invoice)).toBe("client-sale");
    expect(invoice.issuerRef).toEqual({ kind: "nurse", id: "u-sarah" });
    expect(invoice.patientID).toBe(claire.id);
    expect(invoice.billTo?.businessName).toBe("Claire Donovan");
    expect(invoice.doctorID).toBe("");
    // GST-inclusive retail: the client pays the listed price, GST = round(price/11).
    expect(invoice.totalCents).toBe(item.priceCents);
    expect(invoice.gstCents).toBe(Math.round(item.priceCents / 11));
    expect(invoice.lines[0].description).toBe(item.name);
    expect(invoice.draft).toBeFalsy();
    expect(invoice.paid).toBe(false);
  });

  it("a doctor checking out his own client issues under his own entity", () => {
    const state = buildSeedState();
    const grace = findPatient(state, "Grace Huang");
    const item = state.priceListByOwner["doctor:u-voss"][0];
    const next = checkoutClient(state, { patientID: grace.id, items: [{ itemID: item.id, qty: 2 }] }, voss, SEED_NOW);
    const invoice = next.invoices[next.invoices.length - 1];
    expect(invoice.issuerRef).toEqual({ kind: "doctor", id: "u-voss" });
    expect(invoice.totalCents).toBe(item.priceCents * 2);
    expect(invoice.lines[0].qty).toBe(2);
    // The issuer block carries the doctor's seeded business entity.
    expect(invoice.issuer?.businessName).toBe("Voss Aesthetics");
    expect(invoice.issuer?.abn).toBe("51824753556");
  });

  it("rejects an empty selection and unknown price-list items", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    expect(() => checkoutClient(state, { patientID: claire.id, items: [] }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
    expect(() => checkoutClient(state, { patientID: claire.id, items: [{ itemID: "nope", qty: 1 }] }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
  });
});

describe("checkoutClient — Scenario B (clinic split billing)", () => {
  it("a practitioner checkout of a clinic client creates the retail invoice + a draft service-fee invoice, cross-linked", () => {
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd");
    const item = state.priceListByOwner[`clinic:${LUMIERE.id}`][0];
    const next = checkoutClient(state, { patientID: amara.id, items: [{ itemID: item.id, qty: 1 }] }, sarahClinic, SEED_NOW);

    const clientInvoice = next.invoices.find((i) => resolveInvoiceKind(i) === "client-sale")!;
    const feeInvoice = next.invoices.find((i) => resolveInvoiceKind(i) === "service-fee")!;
    expect(clientInvoice.issuerRef).toEqual({ kind: "clinic", id: LUMIERE.id });
    expect(clientInvoice.patientID).toBe(amara.id);
    expect(clientInvoice.totalCents).toBe(item.priceCents); // clinic retail, GST-inclusive

    // Service fee: practitioner → clinic, GST-EXCLUSIVE + 10%, queued as a draft.
    const fee = state.serviceFeeCentsByPair[`${LUMIERE.id}_u-sarah`];
    expect(feeInvoice.issuerRef).toEqual({ kind: "nurse", id: "u-sarah" });
    expect(feeInvoice.counterpartyType).toBe("clinic");
    expect(feeInvoice.counterpartyID).toBe(LUMIERE.id);
    expect(feeInvoice.draft).toBe(true);
    expect(feeInvoice.subtotalCents).toBe(fee);
    expect(feeInvoice.gstCents).toBe(Math.round(fee * 0.1));
    expect(feeInvoice.totalCents).toBe(fee + Math.round(fee * 0.1));
    // Cross-linked pair from the one checkout.
    expect(feeInvoice.checkoutID).toBeTruthy();
    expect(feeInvoice.checkoutID).toBe(clientInvoice.checkoutID);
    // The clinic keeps the margin: neither document nets the other.
    expect(clientInvoice.totalCents).not.toBe(feeInvoice.totalCents);
  });

  it("a collaborating doctor's checkout drafts his service fee from the pair map (default when absent)", () => {
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd");
    const item = state.priceListByOwner[`clinic:${LUMIERE.id}`][0];
    const withoutPair = {
      ...state,
      serviceFeeCentsByPair: Object.fromEntries(
        Object.entries(state.serviceFeeCentsByPair).filter(([k]) => k !== `${LUMIERE.id}_u-voss`),
      ),
    };
    const next = checkoutClient(withoutPair, { patientID: amara.id, items: [{ itemID: item.id, qty: 1 }] }, voss, SEED_NOW);
    const feeInvoice = next.invoices.find((i) => resolveInvoiceKind(i) === "service-fee")!;
    expect(feeInvoice.issuerRef).toEqual({ kind: "doctor", id: "u-voss" });
    expect(feeInvoice.subtotalCents).toBe(DEFAULT_SERVICE_FEE_CENTS);
  });

  it("a clinic-admin checkout creates no service-fee invoice", () => {
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd");
    const item = state.priceListByOwner[`clinic:${LUMIERE.id}`][0];
    const next = checkoutClient(state, { patientID: amara.id, items: [{ itemID: item.id, qty: 1 }] }, ava, SEED_NOW);
    expect(next.invoices.filter((i) => resolveInvoiceKind(i) === "service-fee")).toHaveLength(0);
    expect(next.invoices.filter((i) => resolveInvoiceKind(i) === "client-sale")).toHaveLength(1);
  });

  it("finalizeServiceFeeInvoice: only the issuing practitioner finalizes the draft", () => {
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd");
    const item = state.priceListByOwner[`clinic:${LUMIERE.id}`][0];
    const withDraft = checkoutClient(state, { patientID: amara.id, items: [{ itemID: item.id, qty: 1 }] }, sarahClinic, SEED_NOW);
    const draft = withDraft.invoices.find((i) => resolveInvoiceKind(i) === "service-fee")!;
    expect(() => finalizeServiceFeeInvoice(withDraft, draft.id, ava, SEED_NOW)).toThrow(BackendError);
    const done = finalizeServiceFeeInvoice(withDraft, draft.id, sarahClinic, SEED_NOW);
    expect(done.invoices.find((i) => i.id === draft.id)!.draft).toBe(false);
  });
});

describe("checkoutClient — wallet payment", () => {
  it("settles from the wallet all-or-nothing: drawdown linked to the invoice, invoice marked paid", () => {
    let state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    state = topUpWallet(state, { patientID: claire.id, paidCents: 80000, giftCents: 0 }, sarahIndependent, SEED_NOW);
    const item = state.priceListByOwner["nurse:u-sarah"].find((i) => i.priceCents <= 80000)!;
    const next = checkoutClient(
      state, { patientID: claire.id, items: [{ itemID: item.id, qty: 1 }], payFromWallet: true }, sarahIndependent, SEED_NOW,
    );
    const invoice = next.invoices[next.invoices.length - 1];
    expect(invoice.paid).toBe(true);
    expect(invoice.markedBy).toBe("wallet");
    const drawdown = next.walletByPatientID[claire.id].find((e) => e.kind === "drawdown")!;
    expect(drawdown.amountCents).toBe(invoice.totalCents);
    expect(drawdown.invoiceID).toBe(invoice.id);
    expect(walletBalanceCents(next, claire.id)).toBe(80000 - invoice.totalCents);
  });

  it("rejects wallet payment when the balance is insufficient (balance never goes negative)", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const item = state.priceListByOwner["nurse:u-sarah"][0];
    expect(() =>
      checkoutClient(state, { patientID: claire.id, items: [{ itemID: item.id, qty: 1 }], payFromWallet: true }, sarahIndependent, SEED_NOW),
    ).toThrow(BackendError);
    expect(walletBalanceCents(state, claire.id)).toBe(0);
  });
});

describe("checkoutClient — isolation & coexistence", () => {
  it("only owner/collaborator identities may check out", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const amara = findPatient(state, "Amara Boyd");
    const claireItem = state.priceListByOwner["nurse:u-sarah"][0].id;
    const clinicItem = state.priceListByOwner[`clinic:${LUMIERE.id}`][0].id;
    expect(() => checkoutClient(state, { patientID: claire.id, items: [{ itemID: claireItem, qty: 1 }] }, ruby, SEED_NOW)).toThrow(BackendError);
    // Sarah under her INDEPENDENT identity has no commercial reach into the clinic's client.
    expect(() => checkoutClient(state, { patientID: amara.id, items: [{ itemID: clinicItem, qty: 1 }] }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
  });

  it("checkout leaves the authorisation billing pool untouched", () => {
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd");
    const item = state.priceListByOwner[`clinic:${LUMIERE.id}`][0];
    const poolBefore = billableAuthorisations(state, "u-voss").map((r) => r.id).sort();
    const next = checkoutClient(state, { patientID: amara.id, items: [{ itemID: item.id, qty: 1 }] }, sarahClinic, SEED_NOW);
    const poolAfter = billableAuthorisations(next, "u-voss").map((r) => r.id).sort();
    expect(poolAfter).toEqual(poolBefore);
  });

  it("writes a client_checkout audit entry", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const item = state.priceListByOwner["nurse:u-sarah"][0];
    const next = checkoutClient(state, { patientID: claire.id, items: [{ itemID: item.id, qty: 1 }] }, sarahIndependent, SEED_NOW);
    expect(Object.values(next.auditLogByID).some((e) => e.action === "client_checkout")).toBe(true);
  });
});

describe("matrix invoice lifecycle — mark paid", () => {
  it("the issuing practitioner can mark their unpaid client-sale invoice paid; outsiders cannot", async () => {
    const { markInvoicePaid } = await import("../backend");
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const item = state.priceListByOwner["nurse:u-sarah"][0];
    const withSale = checkoutClient(state, { patientID: claire.id, items: [{ itemID: item.id, qty: 1 }] }, sarahIndependent, SEED_NOW);
    const invoice = withSale.invoices[withSale.invoices.length - 1];
    expect(invoice.paid).toBe(false);
    expect(() => markInvoicePaid(withSale, invoice.id, ruby, SEED_NOW)).toThrow(BackendError);
    const done = markInvoicePaid(withSale, invoice.id, sarahIndependent, SEED_NOW);
    expect(done.invoices.find((i) => i.id === invoice.id)!.paid).toBe(true);
  });

  it("clinic-context staff can mark a clinic-issued client invoice paid", async () => {
    const { markInvoicePaid } = await import("../backend");
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd");
    const item = state.priceListByOwner[`clinic:${LUMIERE.id}`][0];
    const withSale = checkoutClient(state, { patientID: amara.id, items: [{ itemID: item.id, qty: 1 }] }, ava, SEED_NOW);
    const invoice = withSale.invoices.find((i) => resolveInvoiceKind(i) === "client-sale")!;
    expect(() => markInvoicePaid(withSale, invoice.id, sarahIndependent, SEED_NOW)).toThrow(BackendError);
    const done = markInvoicePaid(withSale, invoice.id, ava, SEED_NOW);
    expect(done.invoices.find((i) => i.id === invoice.id)!.paid).toBe(true);
  });

  it("a draft service-fee invoice cannot be marked paid before finalizing", async () => {
    const { markInvoicePaid } = await import("../backend");
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd");
    const item = state.priceListByOwner[`clinic:${LUMIERE.id}`][0];
    const withDraft = checkoutClient(state, { patientID: amara.id, items: [{ itemID: item.id, qty: 1 }] }, sarahClinic, SEED_NOW);
    const draft = withDraft.invoices.find((i) => resolveInvoiceKind(i) === "service-fee")!;
    expect(() => markInvoicePaid(withDraft, draft.id, sarahClinic, SEED_NOW)).toThrow(BackendError);
  });
});

describe("ownerKeyOf", () => {
  it("keys a silo as kind:id", () => {
    expect(ownerKeyOf({ kind: "clinic", id: LUMIERE.id })).toBe(`clinic:${LUMIERE.id}`);
    expect(ownerKeyOf({ kind: "nurse", id: "u-sarah" })).toBe("nurse:u-sarah");
  });
});
