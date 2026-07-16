import { describe, it, expect } from "vitest";
import { appointmentScopesFor, mergeAppointmentRows } from "../appointmentsLive";
import type { Row } from "../hydrate";

// Live appointments listeners (16/07 feedback bug 3): the dashboard's "Upcoming
// authorisation calls" must reflect a cancel made on any client without a refresh, so
// appointments get the same per-scope onSnapshot treatment as authRequests — one owner
// scope and one best-effort booker scope per held owner id (uid + each clinic), mirroring
// hydrate's queries exactly (rules are not filters).

function row(id: string, data: Partial<Record<string, unknown>> = {}): Row {
  return {
    id,
    data: {
      type: "authorisation",
      ownerId: "doc-1",
      dateISO: "2026-07-20",
      startMinute: 540,
      endMinute: 550,
      status: "confirmed",
      ...data,
    },
  };
}

describe("appointmentScopesFor", () => {
  it("builds owner + booker scopes for the uid and each clinic", () => {
    const scopes = appointmentScopesFor({ uid: "u1", clinicIds: ["c1"], superAdmin: false });
    expect(scopes.map((s) => s.key)).toEqual(["owner:u1", "booker:u1", "owner:c1", "booker:c1"]);
    expect(scopes.every((s) => s.constraint !== null)).toBe(true);
  });

  it("marks booker scopes optional (rule ships separately — hydrate treats them best-effort)", () => {
    const scopes = appointmentScopesFor({ uid: "u1", clinicIds: [], superAdmin: false });
    expect(scopes.find((s) => s.key === "owner:u1")?.optional).toBeFalsy();
    expect(scopes.find((s) => s.key === "booker:u1")?.optional).toBe(true);
  });

  it("uses one unconstrained scope for a super admin (hydrate parity)", () => {
    const scopes = appointmentScopesFor({ uid: "admin", clinicIds: ["c1"], superAdmin: true });
    expect(scopes).toEqual([{ key: "all", constraint: null }]);
  });
});

describe("mergeAppointmentRows", () => {
  it("unions rows across scopes keyed by id, mapped to Appointment", () => {
    const merged = mergeAppointmentRows({
      "owner:doc-1": [row("a1")],
      "booker:n-1": [row("a2", { ownerId: "doc-2", bookedById: "n-1" })],
    });
    expect(Object.keys(merged).sort()).toEqual(["a1", "a2"]);
    expect(merged.a1.type).toBe("authSlot");
    expect(merged.a1.ownerID).toBe("doc-1");
    expect(merged.a2.bookedByID).toBe("n-1");
  });

  it("dedupes an appointment matching multiple scopes", () => {
    const merged = mergeAppointmentRows({ "owner:u1": [row("a1")], "booker:u1": [row("a1")] });
    expect(Object.keys(merged)).toEqual(["a1"]);
  });

  it("keeps a cancelled appointment so views can drop it live", () => {
    const merged = mergeAppointmentRows({ "owner:u1": [row("a1", { status: "cancelled" })] });
    expect(merged.a1.status).toBe("cancelled");
  });
});
