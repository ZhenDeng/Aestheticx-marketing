import type { Authorisation, ClinicRef, Identity, RepeatUsage } from "./types";
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

// Ad-hoc timeframe count for the "Custom timeframe" card, port of
// BillingLedger.count(forDoctor:/forCounterparty:from:to:) as BillingView uses it:
// inclusive bounds, doctor scoped by doctorID, everyone else by their counterparty
// (clinic context -> the clinic; independent nurse -> themselves). Unlike
// billingSummary this does NOT exclude invoiced authorisations — the iOS ledger is
// append-only, so invoicing never removes an approval from the count.
export function customTimeframeCount(
  authorisations: Authorisation[],
  identity: Identity,
  fromMillis: number,
  toMillis: number,
): number {
  return authorisations.filter((a) => {
    if (a.createdAt < fromMillis || a.createdAt > toMillis) return false;
    if (identity.role === "doctor") return a.doctorID === identity.user.id;
    if (identity.context.kind === "clinic") return a.clinicID === identity.context.clinic.id;
    return a.clinicID === null && a.nurseID === identity.user.id;
  }).length;
}

export interface ClinicStats {
  authorisationsApproved: number;
  patientsServed: number;
  repeatsUsed: number;
}

// Clinic-admin business statistics, port of ClinicStatistics.compute plus the
// ClinicStatsView gate (role == clinicAdmin with a clinic context); everyone else —
// employee nurses included — gets null. "Patients served" is the distinct patients
// among the clinic's in-range repeat usages, per the billing-reports spec; approvals
// reuse the ledger count for the clinic counterparty. Bounds inclusive.
export function clinicBusinessStats(
  authorisations: Authorisation[],
  usages: RepeatUsage[],
  identity: Identity,
  fromMillis: number,
  toMillis: number,
): ClinicStats | null {
  if (identity.role !== "clinicAdmin" || identity.context.kind !== "clinic") return null;
  const clinicID = identity.context.clinic.id;
  const inRange = usages.filter(
    (u) => u.clinicID === clinicID && u.date >= fromMillis && u.date <= toMillis,
  );
  return {
    authorisationsApproved: customTimeframeCount(authorisations, identity, fromMillis, toMillis),
    patientsServed: new Set(inRange.map((u) => u.patientID)).size,
    repeatsUsed: inRange.length,
  };
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
