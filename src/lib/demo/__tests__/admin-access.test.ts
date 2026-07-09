import { describe, expect, it } from "vitest";
import type { Identity, Patient } from "@/lib/demo/types";
import { emptyState, appendAuditEntry, recordAdminPatientAccess, auditLogEntries } from "@/lib/demo/backend";
import { DEMO_ACCOUNTS, demoDoctorRefs } from "@/lib/demo/accounts";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const NOW = Date.UTC(2026, 6, 9);

function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: "p-1", givenName: "Danni", lastName: "Wang",
    dateOfBirth: { year: 1990, month: 5, day: 2 }, gender: "Female",
    address: "1 St", phone: "0400", email: "d@example.com", allergies: "", currentMedications: "",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
    ...over,
  };
}

describe("recordAdminPatientAccess", () => {
  it("logs a denormalised admin_patient_access entry when a super admin opens a file", () => {
    const s = recordAdminPatientAccess(emptyState(), admin, patient(), NOW);
    const entries = auditLogEntries(s);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorID: "u-admin", actorName: "Priya Nair", actorRole: "superAdmin",
      action: "admin_patient_access", targetType: "patient", targetID: "p-1",
      summary: "opened Danni Wang", at: NOW,
    });
  });

  it("is a no-op for a non-admin identity (only admin access is audit-logged)", () => {
    const s0 = emptyState();
    const s1 = recordAdminPatientAccess(s0, nurse, patient(), NOW);
    expect(s1).toBe(s0); // unchanged reference
    expect(auditLogEntries(s1)).toEqual([]);
  });

  it("appends one event per open (no dedup) and sorts newest-first", () => {
    let s = recordAdminPatientAccess(emptyState(), admin, patient({ id: "p-1" }), NOW);
    s = recordAdminPatientAccess(s, admin, patient({ id: "p-2", givenName: "Zoe", lastName: "Lee" }), NOW + 1000);
    const entries = auditLogEntries(s);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.targetID)).toEqual(["p-2", "p-1"]); // desc by `at`
  });

  it("empty state has no audit entries", () => {
    expect(auditLogEntries(emptyState())).toEqual([]);
  });
});

describe("appendAuditEntry", () => {
  it("denormalises the acting identity + summary and defaults absent targets to null", () => {
    const s = appendAuditEntry(emptyState(), { actor: admin, action: "user_deleted", summary: "removed Sam" }, NOW);
    const entries = auditLogEntries(s);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorID: "u-admin", actorName: "Priya Nair", actorRole: "superAdmin",
      action: "user_deleted", targetType: null, targetID: null, summary: "removed Sam", at: NOW,
    });
  });

  it("records the actor's actual role (not just superAdmin)", () => {
    const s = appendAuditEntry(emptyState(), { actor: nurse, action: "request_created", targetType: "request", targetID: "r-1", summary: "raised for Danni Wang" }, NOW);
    expect(auditLogEntries(s)[0]).toMatchObject({ actorRole: "nurse", action: "request_created", targetID: "r-1" });
  });
});

describe("demo cast", () => {
  it("includes a Platform Admin identity so the admin separation is reachable in demo", () => {
    const admins = DEMO_ACCOUNTS.flatMap((a) => a.identities).filter((i) => i.role === "superAdmin");
    expect(admins).toHaveLength(1);
    expect(admins[0].user.id).toBe("u-admin");
  });

  it("does not leak the admin into the doctor picker", () => {
    expect(demoDoctorRefs().map((d) => d.doctorId)).not.toContain("u-admin");
  });
});
