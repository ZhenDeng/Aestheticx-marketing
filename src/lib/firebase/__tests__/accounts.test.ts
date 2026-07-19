import { describe, it, expect } from "vitest";
import { mapAccount } from "@/lib/firebase/mappers";
import { assembleState, type HydrationRows } from "@/lib/firebase/hydrate";

const emptyRows: HydrationRows = {
  patients: [], notesByPatient: {}, authorisations: [], requests: [], appointments: [],
  formsByPatient: {}, invoices: [], scriptPricing: [], noteTemplates: [], followUpTasks: [],
  followUpSettings: null, appointmentReminderLead: null, bookingToken: null,
  doctorStatus: { online: false, alwaysAcceptAuth: false },
  currentUserID: "u-admin",
};

describe("mapAccount", () => {
  it("maps a full users/{uid} doc, including clinic membership keys", () => {
    expect(mapAccount("u1", {
      name: "Janet Wang", email: "janet@example.com", roles: ["nurse"], mustChangePassword: true,
      clinics: { "clinic-lumiere": "employee" },
    })).toEqual({
      id: "u1", name: "Janet Wang", email: "janet@example.com",
      roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: true,
    });
  });

  it("tolerates partial docs and filters unknown roles", () => {
    expect(mapAccount("u2", { roles: ["doctor", "wizard", 42] })).toEqual({
      id: "u2", name: "", email: "", roles: ["doctor"], clinicIDs: [], mustChangePassword: false,
    });
    expect(mapAccount("u3", { clinics: ["not-a-map"] })).toEqual({
      id: "u3", name: "", email: "", roles: [], clinicIDs: [], mustChangePassword: false,
    });
  });
});

describe("assembleState accounts slice", () => {
  it("keys account rows by uid", () => {
    const state = assembleState({
      ...emptyRows,
      accounts: [
        { id: "u1", data: { name: "Janet Wang", email: "j@x.com", roles: ["nurse"] } },
        { id: "u2", data: { name: "Dr Lee", email: "d@x.com", roles: ["doctor"], mustChangePassword: true } },
      ],
    });
    expect(Object.keys(state.accountsByID).sort()).toEqual(["u1", "u2"]);
    expect(state.accountsByID.u2).toMatchObject({ name: "Dr Lee", mustChangePassword: true });
  });

  it("leaves the slice empty when no accounts rows were hydrated", () => {
    expect(assembleState(emptyRows).accountsByID).toEqual({});
  });
});
