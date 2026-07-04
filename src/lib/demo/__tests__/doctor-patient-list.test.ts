import { describe, it, expect } from "vitest";
import type { Identity, Patient } from "@/lib/demo/types";
import { splitPatients, partitionPatients, groupPatientsByOwner } from "@/lib/demo/backend";
import { ownerLabel } from "@/lib/demo/accounts";

// Port of iOS DoctorPatientList.{partition,grouped} + PatientListView.split +
// SessionState.ownerLabel (spec: patient-records → "Doctor patient list grouping").

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const sarah: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const admin: Identity = { user: { id: "u-ava", name: "Ava Lim" }, role: "clinicAdmin", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière Clinic" } } };

function patient(id: string, owner: Patient["owner"]): Patient {
  return { id, givenName: "P", lastName: id, dateOfBirth: { year: 1980, month: 1, day: 1 },
    gender: "Female", address: "x", phone: "x", email: "x", allergies: "x", currentMedications: "x",
    owner, prescribingDoctorIDs: [] };
}

const own1 = patient("own1", { kind: "doctor", id: "u-voss" });
const own2 = patient("own2", { kind: "doctor", id: "u-voss" });
const otherDoctors = patient("od", { kind: "doctor", id: "u-someone-else" });
const nurseOwned = patient("np", { kind: "nurse", id: "u-sarah" });
const clinicOwned = patient("cp", { kind: "clinic", id: "clinic-lumiere" });

describe("partitionPatients", () => {
  it("splits doctor-owned-by-me from everything else, preserving input order", () => {
    const { own, others } = partitionPatients([nurseOwned, own1, clinicOwned, own2, otherDoctors], "u-voss");
    expect(own.map((p) => p.id)).toEqual(["own1", "own2"]);
    expect(others.map((p) => p.id)).toEqual(["np", "cp", "od"]);
  });
});

describe("splitPatients", () => {
  it("splits only under a doctor identity", () => {
    const { own, others } = splitPatients([own1, nurseOwned, clinicOwned], voss);
    expect(own.map((p) => p.id)).toEqual(["own1"]);
    expect(others.map((p) => p.id)).toEqual(["np", "cp"]);
  });
  it("keeps one combined list for a nurse", () => {
    const { own, others } = splitPatients([own1, nurseOwned], sarah);
    expect(own.map((p) => p.id)).toEqual(["own1", "np"]);
    expect(others).toEqual([]);
  });
  it("keeps one combined list for a clinic admin", () => {
    const { own, others } = splitPatients([clinicOwned, nurseOwned], admin);
    expect(own.map((p) => p.id)).toEqual(["cp", "np"]);
    expect(others).toEqual([]);
  });
});

describe("groupPatientsByOwner", () => {
  it("groups by label, sorted by key, preserving each bucket's input order", () => {
    const s1 = patient("s1", { kind: "nurse", id: "u-sarah" });
    const s2 = patient("s2", { kind: "nurse", id: "u-sarah" });
    const c1 = patient("c1", { kind: "clinic", id: "clinic-lumiere" });
    const groups = groupPatientsByOwner([s2, c1, s1], ownerLabel);
    expect(groups.map((g) => g.key)).toEqual(["Lumière Clinic", "Sarah Chen"]);
    expect(groups[1].patients.map((p) => p.id)).toEqual(["s2", "s1"]);
  });
  it("sorts keys with numeric awareness (localizedStandardCompare parity)", () => {
    const a = patient("a", { kind: "clinic", id: "Clinic 2" });
    const b = patient("b", { kind: "clinic", id: "Clinic 10" });
    const groups = groupPatientsByOwner([b, a], ownerLabel);
    expect(groups.map((g) => g.key)).toEqual(["Clinic 2", "Clinic 10"]);
  });
});

describe("ownerLabel", () => {
  it("names the Lumière clinic and falls back to the raw id for unknown clinics", () => {
    expect(ownerLabel({ kind: "clinic", id: "clinic-lumiere" })).toBe("Lumière Clinic");
    expect(ownerLabel({ kind: "clinic", id: "clinic-x" })).toBe("clinic-x");
  });
  it("resolves nurse/doctor owners through the demo accounts, else the raw id", () => {
    expect(ownerLabel({ kind: "nurse", id: "u-sarah" })).toBe("Sarah Chen");
    expect(ownerLabel({ kind: "doctor", id: "u-voss" })).toBe("Dr Elena Voss");
    expect(ownerLabel({ kind: "nurse", id: "u-mystery" })).toBe("u-mystery");
  });
});
