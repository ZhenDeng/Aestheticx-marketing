import type { Authorisation, ClinicRef, Identity } from "./types";
import type { DemoAccount } from "./accounts";

// UTC "YYYY-MM", matching the backend domain.monthKey.
export function monthKey(millis: number): string {
  const d = new Date(millis);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface BillingParty { id: string; type: "doctor" | "nurse" | "clinic"; count: number; }
export interface BillingMonth { monthKey: string; count: number; byParty: BillingParty[]; }
export interface BillingSummary { totalCount: number; months: BillingMonth[]; }

interface BillableRow { doctorID: string; counterpartyType: "nurse" | "clinic"; counterpartyID: string; monthKey: string; }

function isVisible(r: BillableRow, identity: Identity): boolean {
  if (identity.role === "doctor") return r.doctorID === identity.user.id;
  const clinicId = identity.context.kind === "clinic" ? identity.context.clinic.id : null;
  // Clinic-context users see their clinic's rows; a clinic nurse's own requests bill
  // the clinic, so they never appear as a nurse-type counterparty. Independent nurses
  // match nurse-type rows by their user id.
  if (r.counterpartyType === "clinic") return clinicId !== null && r.counterpartyID === clinicId;
  return r.counterpartyType === "nurse" && r.counterpartyID === identity.user.id;
}

// Counts un-invoiced authorisations (line items). Doctors group by the counterparty
// they bill; everyone else groups by the doctor billing them.
export function billingSummary(authorisations: Authorisation[], identity: Identity): BillingSummary {
  const rows: BillableRow[] = authorisations
    .filter((a) => !a.invoiced)
    .map((a) => ({
      doctorID: a.doctorID,
      counterpartyType: a.clinicID ? "clinic" : "nurse",
      counterpartyID: a.clinicID ?? a.nurseID,
      monthKey: monthKey(a.createdAt),
    }));
  const visible = rows.filter((r) => isVisible(r, identity));
  const byMonth = new Map<string, Map<string, BillingParty>>();
  for (const r of visible) {
    const party: BillingParty = identity.role === "doctor"
      ? { id: r.counterpartyID, type: r.counterpartyType, count: 0 }
      : { id: r.doctorID, type: "doctor", count: 0 };
    const month = byMonth.get(r.monthKey) ?? new Map<string, BillingParty>();
    const key = `${party.type}:${party.id}`;
    const existing = month.get(key);
    if (existing) existing.count += 1;
    else month.set(key, { ...party, count: 1 });
    byMonth.set(r.monthKey, month);
  }
  const months: BillingMonth[] = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([mk, parties]) => {
      const byParty = [...parties.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
      return { monthKey: mk, count: byParty.reduce((sum, p) => sum + p.count, 0), byParty };
    });
  return { totalCount: visible.length, months };
}

export function partyLabel(type: BillingParty["type"], id: string, accounts: DemoAccount[], clinic: ClinicRef): string {
  if (type === "clinic") return clinic.id === id ? clinic.name : id;
  for (const acc of accounts) for (const idn of acc.identities) {
    if (idn.user.id === id) return idn.user.name;
  }
  return id;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return key;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
