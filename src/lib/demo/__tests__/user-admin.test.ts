import { describe, expect, it } from "vitest";
import { validateNewUser } from "@/lib/demo/userAdmin";
import { accountsInventory, emptyState } from "@/lib/demo/backend";
import { buildSeedState } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { AccountRecord } from "@/lib/demo/types";

// Port parity with backend/functions/src/userAdmin.test.ts — the web form must
// pre-validate exactly like the deployed createUser Function.
const premise = { name: "Chen Aesthetics", address: "12 Hall St, Bondi Beach NSW 2026" };
const base = {
  email: "rn@clinic.au", name: "Sarah Chen", abn: "12 345 678 901",
  businessName: "Chen Aesthetics", phone: "0400 000 000",
  temporaryPassword: "Temp1234!", roles: ["nurse"], ahpra: "NMW0001",
  premises: [premise],
};
const doctor = { ...base, roles: ["doctor"], premises: undefined, principalPlace: "88 Oxford St, Paddington NSW 2021" };

describe("validateNewUser", () => {
  it("accepts a complete nurse", () => {
    expect(validateNewUser(base)).toEqual([]);
  });

  it("flags each missing required field", () => {
    expect(validateNewUser({ ...base, email: "" })).toContain("email");
    expect(validateNewUser({ ...base, name: " " })).toContain("name");
    expect(validateNewUser({ ...base, abn: "" })).toContain("abn");
    expect(validateNewUser({ ...base, businessName: "" })).toContain("businessName");
    expect(validateNewUser({ ...base, phone: "" })).toContain("phone");
    expect(validateNewUser({ ...base, roles: [] })).toContain("roles");
  });

  it("requires AHPRA for doctors and nurses", () => {
    expect(validateNewUser({ ...base, roles: ["nurse"], ahpra: "" })).toContain("ahpra");
    expect(validateNewUser({ ...doctor, ahpra: undefined })).toContain("ahpra");
  });

  it("does not require AHPRA when the account is clinic admin only", () => {
    expect(validateNewUser({ ...base, roles: ["clinicAdmin"], ahpra: "" })).toEqual([]);
  });

  it("requires a temporary password of at least 8 characters", () => {
    expect(validateNewUser({ ...base, temporaryPassword: "short" })).toContain("temporaryPassword");
  });

  // Round 6 (auth-pdf-feedback-round-6): the account must carry everything the
  // treatment-authorisation PDF needs, captured at creation.
  it("accepts a complete doctor and requires their principal place of practice", () => {
    expect(validateNewUser(doctor)).toEqual([]);
    expect(validateNewUser({ ...doctor, principalPlace: " " })).toContain("principalPlace");
    expect(validateNewUser({ ...doctor, principalPlace: undefined })).toContain("principalPlace");
  });

  it("requires at least one COMPLETE premise for nurses", () => {
    expect(validateNewUser({ ...base, premises: undefined })).toContain("premises");
    expect(validateNewUser({ ...base, premises: [] })).toContain("premises");
    expect(validateNewUser({ ...base, premises: [{ name: "X", address: " " }] })).toContain("premises");
    expect(validateNewUser({ ...base, premises: [premise, { name: "", address: "1 St" }] })).toContain("premises");
  });

  it("accepts a clinic account: no AHPRA, clinicAdmin role, clinic address required", () => {
    const clinic = {
      ...base, accountType: "clinic", roles: ["clinicAdmin"], ahpra: "",
      premises: undefined, name: "Eydis Aesthetics",
      clinicAddress: "7/61 Market St, Sydney NSW 2000",
    };
    expect(validateNewUser(clinic)).toEqual([]);
    expect(validateNewUser({ ...clinic, clinicAddress: "" })).toContain("clinicAddress");
    expect(validateNewUser({ ...clinic, roles: ["nurse"] })).toContain("roles (clinic accounts must carry clinicAdmin)");
    // A clinic must not smuggle clinical roles past the practitioner requirements.
    expect(validateNewUser({ ...clinic, roles: ["clinicAdmin", "doctor"] }))
      .toContain("roles (clinic accounts cannot carry doctor/nurse roles)");
    // Clinic accounts skip the practitioner requirements even with clinical roles absent.
    expect(validateNewUser({ ...clinic, ahpra: undefined })).toEqual([]);
  });
});

describe("accountsInventory", () => {
  it("is empty on the empty state", () => {
    expect(accountsInventory(emptyState())).toEqual([]);
  });

  it("sorts accounts by name, case-insensitively", () => {
    const s = emptyState();
    const mk = (id: string, name: string): AccountRecord => ({
      id, name, email: "", roles: ["nurse"], mustChangePassword: false,
    });
    s.accountsByID = { a: mk("a", "zoe"), b: mk("b", "Ava"), c: mk("c", "Mia") };
    expect(accountsInventory(s).map((a) => a.name)).toEqual(["Ava", "Mia", "zoe"]);
  });
});

describe("seeded demo accounts", () => {
  it("seeds one AccountRecord per demo account with its roles", () => {
    const s = buildSeedState();
    const records = accountsInventory(s);
    expect(records).toHaveLength(DEMO_ACCOUNTS.length);
    const sarah = records.find((r) => r.name === "Sarah Chen");
    expect(sarah).toMatchObject({ roles: ["nurse"], mustChangePassword: false });
  });
});
