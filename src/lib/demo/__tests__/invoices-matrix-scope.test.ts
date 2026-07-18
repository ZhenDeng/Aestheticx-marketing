// Invoice read scoping across the billing matrix (delta spec: invoicing —
// "Invoice access by direction and kind"): a user sees an invoice when their active
// identity is the ISSUER silo or the BILL-TO counterparty; drafts stay issuer-only.
import { describe, expect, it } from "vitest";
import { invoicesFor, type Invoice } from "../invoicing";
import { LUMIERE } from "../accounts";
import type { Identity } from "../types";

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const ruby: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const ava: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: LUMIERE } };

let n = 0;
function inv(partial: Partial<Invoice>): Invoice {
  return {
    id: `inv-${++n}`, doctorID: "", counterpartyID: "", counterpartyType: "client",
    periodLabel: "2026-06-26", lines: [], subtotalCents: 0, gstCents: 0, totalCents: 0,
    authorisationIDs: [], createdAt: 0, paid: false,
    ...partial,
  };
}

const legacyAuth = inv({ doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse", kind: undefined });
const legacyClinicAuth = inv({ doctorID: "u-voss", counterpartyID: LUMIERE.id, counterpartyType: "clinic", kind: undefined });
const sarahSale = inv({ kind: "client-sale", issuerRef: { kind: "nurse", id: "u-sarah" }, patientID: "p-claire" });
const sarahTopUp = inv({ kind: "top-up", issuerRef: { kind: "nurse", id: "u-sarah" }, patientID: "p-claire" });
const clinicSale = inv({ kind: "client-sale", issuerRef: { kind: "clinic", id: LUMIERE.id }, patientID: "p-amara" });
const vossSale = inv({ kind: "client-sale", issuerRef: { kind: "doctor", id: "u-voss" }, patientID: "p-grace" });
const sarahFeeDraft = inv({ kind: "service-fee", draft: true, issuerRef: { kind: "nurse", id: "u-sarah" }, counterpartyID: LUMIERE.id, counterpartyType: "clinic" });
const sarahFeeFinal = inv({ kind: "service-fee", draft: false, issuerRef: { kind: "nurse", id: "u-sarah" }, counterpartyID: LUMIERE.id, counterpartyType: "clinic" });
const all = [legacyAuth, legacyClinicAuth, sarahSale, sarahTopUp, clinicSale, vossSale, sarahFeeDraft, sarahFeeFinal];

function ids(list: Invoice[]): string[] { return list.map((i) => i.id).sort(); }

describe("invoicesFor — matrix scoping", () => {
  it("doctor: authorisation stream unchanged, plus documents he issued", () => {
    expect(ids(invoicesFor(all, voss))).toEqual(ids([legacyAuth, legacyClinicAuth, vossSale]));
  });

  it("nurse (independent): receives her authorisation invoices and sees everything she issued", () => {
    expect(ids(invoicesFor(all, sarahIndependent))).toEqual(ids([legacyAuth, sarahSale, sarahTopUp, sarahFeeDraft, sarahFeeFinal]));
  });

  it("clinic context: clinic-billed authorisation invoices, clinic-issued sales, and FINALIZED received service fees", () => {
    expect(ids(invoicesFor(all, ava))).toEqual(ids([legacyClinicAuth, clinicSale, sarahFeeFinal]));
    // Ruby (clinic nurse) sees the clinic's stream too, but nothing Sarah issued personally.
    expect(ids(invoicesFor(all, ruby))).toEqual(ids([legacyClinicAuth, clinicSale, sarahFeeFinal]));
  });

  it("drafts are issuer-only: the clinic cannot see Sarah's un-finalized service fee", () => {
    expect(ids(invoicesFor(all, ava))).not.toContain(sarahFeeDraft.id);
    expect(ids(invoicesFor(all, sarahClinic))).toContain(sarahFeeDraft.id);
  });
});
