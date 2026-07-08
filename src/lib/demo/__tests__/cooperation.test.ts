import { describe, it, expect } from "vitest";
import type { CooperationRelationship } from "@/lib/demo/types";
import {
  cooperationDocId, relationshipGatePasses, cooperatingDoctorsFor, relationshipFor,
  priceCentsFor, invoiceAppliesFor,
} from "@/lib/demo/cooperation";

function rel(over: Partial<CooperationRelationship>): CooperationRelationship {
  return {
    id: "x", doctorID: "d1", doctorName: "Dr A", counterpartyType: "nurse", counterpartyID: "n1",
    counterpartyName: "Nurse", status: "active", authRequestsAllowed: true, invoiceApplies: true,
    priceCentsOverride: null, createdAt: 1, updatedAt: 1, ...over,
  };
}

describe("cooperationDocId", () => {
  it("is deterministic per (doctor, type, counterparty)", () => {
    expect(cooperationDocId("d1", "clinic", "c1")).toBe("d1_clinic_c1");
  });
});

describe("relationshipGatePasses", () => {
  it("passes only active + request-allowed", () => {
    expect(relationshipGatePasses(rel({}))).toBe(true);
    expect(relationshipGatePasses(rel({ status: "inactive" }))).toBe(false);
    expect(relationshipGatePasses(rel({ authRequestsAllowed: false }))).toBe(false);
  });
});

describe("cooperatingDoctorsFor", () => {
  const rels = [
    rel({ id: "1", doctorID: "d-bea", doctorName: "Dr Bea", counterpartyID: "n1" }),
    rel({ id: "2", doctorID: "d-ann", doctorName: "Dr Ann", counterpartyID: "n1" }),
    rel({ id: "3", doctorID: "d-cy", doctorName: "Dr Cy", counterpartyID: "n1", status: "inactive" }),   // gated out
    rel({ id: "4", doctorID: "d-di", doctorName: "Dr Di", counterpartyID: "n2" }),                        // other counterparty
    rel({ id: "5", doctorID: "d-ann", doctorName: "Dr Ann", counterpartyID: "n1" }),                      // dup doctor
    rel({ id: "6", doctorID: "d-ez", doctorName: "Dr Ez", counterpartyType: "clinic", counterpartyID: "n1" }), // wrong type
  ];
  it("returns active+allowed doctors for the counterparty, name-sorted + deduped", () => {
    expect(cooperatingDoctorsFor(rels, "nurse", "n1")).toEqual([
      { doctorId: "d-ann", doctorName: "Dr Ann" },
      { doctorId: "d-bea", doctorName: "Dr Bea" },
    ]);
  });
  it("is empty for a counterparty with no active relationships", () => {
    expect(cooperatingDoctorsFor(rels, "clinic", "no-such")).toEqual([]);
  });
});

describe("priceCentsFor + invoiceAppliesFor", () => {
  it("prefers the relationship override, then legacy scriptPricing, then default", () => {
    expect(priceCentsFor(rel({ priceCentsOverride: 4000 }), 3000)).toBe(4000);
    expect(priceCentsFor(rel({ priceCentsOverride: null }), 3000)).toBe(3000);
    expect(priceCentsFor(undefined, undefined)).toBe(2500); // DEFAULT_SCRIPT_PRICE_CENTS
  });
  it("invoiceApplies defaults true without a relationship; honours the flag otherwise", () => {
    expect(invoiceAppliesFor(undefined)).toBe(true);
    expect(invoiceAppliesFor(rel({ invoiceApplies: false }))).toBe(false);
  });
  it("relationshipFor resolves by deterministic id", () => {
    const map = { [cooperationDocId("d1", "nurse", "n1")]: rel({}) };
    expect(relationshipFor(map, "d1", "nurse", "n1")).toBeDefined();
    expect(relationshipFor(map, "d1", "clinic", "n1")).toBeUndefined();
  });
});
