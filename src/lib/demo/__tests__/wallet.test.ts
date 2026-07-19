// Patient wallet: top-ups with gift credit + derived balance (spec: patient-wallet).
import { describe, expect, it } from "vitest";
import { BackendError, topUpWallet, walletBalanceCents } from "../backend";
import { resolveInvoiceKind } from "../invoicing";
import { buildSeedState, SEED_NOW } from "../seed";
import { LUMIERE } from "../accounts";
import { fullName, type DemoState, type Identity, type Patient } from "../types";

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const ruby: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const ava: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

function findPatient(state: DemoState, name: string): Patient {
  const p = Object.values(state.patients).find((x) => fullName(x) === name);
  if (!p) throw new Error(`seed patient ${name} missing`);
  return p;
}

describe("topUpWallet", () => {
  it("records paid + gift as separate cents, credits the total, and issues a paid-only tax invoice", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan"); // nurse-owned by Sarah
    const next = topUpWallet(state, { patientID: claire.id, paidCents: 400000, giftCents: 100000 }, sarahIndependent, SEED_NOW);

    const entries = next.walletByPatientID[claire.id];
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    if (entry.kind !== "topup") throw new Error("expected a topup entry");
    expect(entry.paidCents).toBe(400000);
    expect(entry.giftCents).toBe(100000);
    expect(entry.totalCreditCents).toBe(500000);
    expect(walletBalanceCents(next, claire.id)).toBe(500000);

    // The linked tax invoice charges ONLY the paid amount (GST-inclusive: $4,000 incl $363.64 GST).
    const invoice = next.invoices.find((i) => i.id === entry.invoiceID);
    expect(invoice).toBeDefined();
    expect(resolveInvoiceKind(invoice!)).toBe("top-up");
    expect(invoice!.totalCents).toBe(400000);
    expect(invoice!.gstCents).toBe(36364);
    expect(invoice!.giftCents).toBe(100000);
    expect(invoice!.totalCreditCents).toBe(500000);
    expect(invoice!.patientID).toBe(claire.id);
    expect(invoice!.issuerRef).toEqual({ kind: "nurse", id: "u-sarah" });
    expect(invoice!.billTo?.businessName).toBe("Claire Donovan");
    // Matrix invoices leave the legacy doctor-centric fields inert.
    expect(invoice!.doctorID).toBe("");
    expect(invoice!.paid).toBe(true); // a top-up is settled at the counter by definition
  });

  it("a plain cash top-up has zero gift and credits exactly the paid amount", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const next = topUpWallet(state, { patientID: claire.id, paidCents: 50000, giftCents: 0 }, sarahIndependent, SEED_NOW);
    expect(walletBalanceCents(next, claire.id)).toBe(50000);
    const entry = next.walletByPatientID[claire.id][0];
    if (entry.kind !== "topup") throw new Error("expected a topup entry");
    expect(entry.giftCents).toBe(0);
    const invoice = next.invoices.find((i) => i.id === entry.invoiceID)!;
    expect(invoice.giftCents).toBe(0);
    expect(invoice.totalCents).toBe(50000);
  });

  it("clinic staff top up a clinic-owned client with the clinic as issuer", () => {
    const state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd"); // clinic-owned
    const next = topUpWallet(state, { patientID: amara.id, paidCents: 100000, giftCents: 20000 }, ava, SEED_NOW);
    const entry = next.walletByPatientID[amara.id][0];
    if (entry.kind !== "topup") throw new Error("expected a topup entry");
    const invoice = next.invoices.find((i) => i.id === entry.invoiceID)!;
    expect(invoice.issuerRef).toEqual({ kind: "clinic", id: LUMIERE.id });
  });

  it("only the owning silo may top up (isolation)", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan"); // Sarah's independent client
    expect(() => topUpWallet(state, { patientID: claire.id, paidCents: 1000, giftCents: 0 }, ruby, SEED_NOW)).toThrow(BackendError);
    // Clinic staff cannot top up an independent nurse's client, and vice versa.
    const amara = findPatient(state, "Amara Boyd");
    expect(() => topUpWallet(state, { patientID: amara.id, paidCents: 1000, giftCents: 0 }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
  });

  it("rejects zero-total, negative, and non-integer amounts", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    expect(() => topUpWallet(state, { patientID: claire.id, paidCents: 0, giftCents: 0 }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
    expect(() => topUpWallet(state, { patientID: claire.id, paidCents: -100, giftCents: 0 }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
    expect(() => topUpWallet(state, { patientID: claire.id, paidCents: 100.5, giftCents: 0 }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
    expect(() => topUpWallet(state, { patientID: claire.id, paidCents: 1000, giftCents: -1 }, sarahIndependent, SEED_NOW)).toThrow(BackendError);
  });

  it("a gift-only top-up (zero paid) credits the wallet without issuing a tax invoice", () => {
    // Nothing was collected, so there is no financial transaction to invoice — the ledger
    // entry alone records the promotional grant.
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const before = state.invoices.length;
    const next = topUpWallet(state, { patientID: claire.id, paidCents: 0, giftCents: 30000 }, sarahIndependent, SEED_NOW);
    expect(walletBalanceCents(next, claire.id)).toBe(30000);
    expect(next.invoices.length).toBe(before);
    const entry = next.walletByPatientID[claire.id][0];
    if (entry.kind !== "topup") throw new Error("expected a topup entry");
    expect(entry.invoiceID).toBe("");
  });

  it("mergePatients carries the removed duplicate's wallet ledger onto the kept file", async () => {
    const { mergePatients } = await import("../backend");
    let state = buildSeedState();
    const amara = findPatient(state, "Amara Boyd");
    // A duplicate clinic record holding credit.
    const dup: Patient = { ...amara, id: "p-dup", lastName: "Boyd-Dup", prescribingDoctorIDs: [] };
    state = { ...state, patients: { ...state.patients, [dup.id]: dup } };
    state = topUpWallet(state, { patientID: dup.id, paidCents: 50000, giftCents: 0 }, ava, SEED_NOW);
    const keepBefore = walletBalanceCents(state, amara.id);
    state = mergePatients(state, amara.id, dup.id, ava);
    expect(walletBalanceCents(state, amara.id)).toBe(keepBefore + 50000);
    expect(state.walletByPatientID[dup.id]).toBeUndefined();
  });

  it("writes a wallet_topup audit entry", () => {
    const state = buildSeedState();
    const claire = findPatient(state, "Claire Donovan");
    const next = topUpWallet(state, { patientID: claire.id, paidCents: 400000, giftCents: 100000 }, sarahIndependent, SEED_NOW);
    const audit = Object.values(next.auditLogByID).find((e) => e.action === "wallet_topup" && e.targetID === claire.id);
    expect(audit).toBeDefined();
    expect(audit!.summary).toContain("$4,000.00");
    expect(audit!.summary).toContain("$1,000.00");
  });
});
