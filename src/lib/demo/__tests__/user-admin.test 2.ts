import { describe, expect, it } from "vitest";
import { validateNewUser } from "@/lib/demo/userAdmin";
import { accountsInventory, emptyState } from "@/lib/demo/backend";
import { buildSeedState } from "@/lib/demo/seed";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { AccountRecord } from "@/lib/demo/types";

// Port parity with backend/functions/src/userAdmin.test.ts — the web form must
// pre-validate exactly like the deployed createUser Function.
const base = {
  email: "rn@clinic.au", name: "Sarah Chen", abn: "12 345 678 901",
  businessName: "Chen Aesthetics", phone: "0400 000 000",
  temporaryPassword: "Temp1234!", roles: ["nurse"], ahpra: "NMW0001",
};

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
    expect(validateNewUser({ ...base, roles: ["doctor"], ahpra: undefined })).toContain("ahpra");
  });

  it("does not require AHPRA when the account is clinic admin only", () => {
    expect(validateNewUser({ ...base, roles: ["clinicAdmin"], ahpra: "" })).toEqual([]);
  });

  it("requires a temporary password of at least 8 characters", () => {
    expect(validateNewUser({ ...base, temporaryPassword: "short" })).toContain("temporaryPassword");
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
