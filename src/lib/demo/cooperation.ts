// Pure cooperation-relationship logic (spec 2026-07-08 cooperation-relationships, constitution §17).
// Imports only ./types + the pricing default — no dependency on backend.ts, so backend.ts imports this.
import type { CooperationRelationship, CounterpartyType } from "./types";
import { DEFAULT_SCRIPT_PRICE_CENTS } from "./invoicing";

export function cooperationDocId(doctorID: string, counterpartyType: CounterpartyType, counterpartyID: string): string {
  return `${doctorID}_${counterpartyType}_${counterpartyID}`;
}

// The gate: a nurse/clinic may request from a doctor only via an active, request-allowed relationship.
export function relationshipGatePasses(rel: CooperationRelationship): boolean {
  return rel.status === "active" && rel.authRequestsAllowed;
}

// Doctors the given counterparty may request authorisation from — active + request-allowed only,
// deduped by doctor, name-sorted. This is the single eligibility source both pickers use.
export function cooperatingDoctorsFor(
  relationships: CooperationRelationship[],
  counterpartyType: CounterpartyType,
  counterpartyID: string,
): { doctorId: string; doctorName: string }[] {
  const seen = new Set<string>();
  const out: { doctorId: string; doctorName: string }[] = [];
  for (const rel of relationships) {
    if (rel.counterpartyType !== counterpartyType || rel.counterpartyID !== counterpartyID) continue;
    if (!relationshipGatePasses(rel)) continue;
    if (seen.has(rel.doctorID)) continue;
    seen.add(rel.doctorID);
    out.push({ doctorId: rel.doctorID, doctorName: rel.doctorName });
  }
  return out.sort((a, b) => a.doctorName.localeCompare(b.doctorName));
}

export function relationshipFor(
  relationships: Record<string, CooperationRelationship>,
  doctorID: string,
  counterpartyType: CounterpartyType,
  counterpartyID: string,
): CooperationRelationship | undefined {
  return relationships[cooperationDocId(doctorID, counterpartyType, counterpartyID)];
}

// Price precedence: the relationship's override → legacy per-pair scriptPricing → default $25.
export function priceCentsFor(
  relationship: CooperationRelationship | undefined,
  legacyScriptPriceCents: number | undefined,
): number {
  return relationship?.priceCentsOverride ?? legacyScriptPriceCents ?? DEFAULT_SCRIPT_PRICE_CENTS;
}

// Invoicing applies unless a relationship explicitly turns it off (default true — no behaviour
// change for pairs without a relationship, e.g. before backfill).
export function invoiceAppliesFor(relationship: CooperationRelationship | undefined): boolean {
  return relationship ? relationship.invoiceApplies : true;
}
