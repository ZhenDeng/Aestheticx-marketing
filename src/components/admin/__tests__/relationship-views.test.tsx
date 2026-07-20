// Prescribing/Employment relationship views (spec: admin-relationship-views, 20/07
// feedback): the combined list becomes two switchable views — Prescribing groups by
// doctor (nurse counterparties + prescriber-kind clinics), Employment groups by clinic
// (employee-kind doctor relationships + member accounts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CooperationRelationship, Identity } from "@/lib/demo/types";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

const setCooperationRelationship = vi.fn();
let relationships: CooperationRelationship[] = [];
let clinicDirectory: { id: string; label: string; unnamed?: boolean }[] = [];
let accounts: { id: string; name: string; email: string; roles: string[]; clinicIDs?: string[]; mustChangePassword: boolean }[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: admin, availableIdentities: [admin], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    accounts: () => accounts,
    cooperationRelationships: () => relationships,
    relationshipAuditFor: () => [],
    clinics: () => clinicDirectory,
    listDoctors: () => Promise.resolve([{ doctorId: "u-voss", doctorName: "Dr Elena Voss" }]),
    setCooperationRelationship,
    removeCooperationRelationship: vi.fn(),
  }),
}));

import { CooperationRelationshipsSection } from "@/components/admin/RelationshipsSection";

function rel(overrides: Partial<CooperationRelationship> & Pick<CooperationRelationship, "id" | "doctorID" | "doctorName" | "counterpartyType" | "counterpartyID" | "counterpartyName">): CooperationRelationship {
  return {
    status: "active",
    authRequestsAllowed: true,
    invoiceApplies: true,
    priceCentsOverride: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

async function renderSection() {
  render(<CooperationRelationshipsSection />);
  await act(async () => {});
}

beforeEach(() => {
  setCooperationRelationship.mockReset();
  clinicDirectory = [{ id: "clinic-lumiere", label: "Lumière Clinic" }];
  accounts = [
    { id: "u-nurse", name: "Yinghua Xu", email: "nurse@example.com", roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false },
    { id: "u-ava", name: "Ava Lim", email: "ava@example.com", roles: ["clinicAdmin"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false },
    { id: "u-indep", name: "Indie Nurse", email: "indie@example.com", roles: ["nurse"], mustChangePassword: false },
  ];
  relationships = [
    rel({ id: "u-voss_nurse_u-nurse", doctorID: "u-voss", doctorName: "Dr Elena Voss", counterpartyType: "nurse", counterpartyID: "u-nurse", counterpartyName: "Yinghua Xu" }),
    rel({ id: "u-voss_clinic_clinic-lumiere", doctorID: "u-voss", doctorName: "Dr Elena Voss", counterpartyType: "clinic", counterpartyID: "clinic-lumiere", counterpartyName: "Lumière Clinic", relationshipKinds: ["employee", "prescriber"] }),
    rel({ id: "u-second_clinic_clinic-lumiere", doctorID: "u-second", doctorName: "Dr Omar Riz", counterpartyType: "clinic", counterpartyID: "clinic-lumiere", counterpartyName: "Lumière Clinic", relationshipKinds: ["employee"] }),
  ];
});

describe("view switcher", () => {
  it("shows Prescribing by default with an Employment alternative", async () => {
    await renderSection();
    expect(screen.getByRole("button", { name: "Prescribing" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Employment" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the create-relationship entry point in both views", async () => {
    await renderSection();
    expect(screen.getByRole("button", { name: "Add cooperation relationship" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Employment" }));
    expect(screen.getByRole("button", { name: "Add cooperation relationship" })).toBeInTheDocument();
  });
});

describe("Prescribing view", () => {
  it("lists nurse counterparties and prescriber-kind clinics under the doctor", async () => {
    await renderSection();
    const voss = screen.getByText("Dr Elena Voss").closest("div")!;
    expect(within(voss).getByText("Yinghua Xu")).toBeInTheDocument();
    expect(within(voss).getByText("Lumière Clinic")).toBeInTheDocument();
  });

  it("hides employee-only clinic relationships (their doctor group disappears when empty)", async () => {
    await renderSection();
    // Dr Omar Riz's only relationship is employee-only — no prescribing row, no group.
    expect(screen.queryByText("Dr Omar Riz")).not.toBeInTheDocument();
  });
});

describe("Employment view", () => {
  it("groups staff by clinic: employee-kind doctors (editable) + member accounts (informational)", async () => {
    await renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Employment" }));
    const clinicCard = screen.getByText("Lumière Clinic", { selector: "h3" }).closest("div")!;
    // Employee-kind doctors appear with the full edit affordances.
    expect(within(clinicCard).getByText("Dr Elena Voss")).toBeInTheDocument();
    expect(within(clinicCard).getByText("Dr Omar Riz")).toBeInTheDocument();
    expect(within(clinicCard).getAllByRole("button", { name: "Employee" }).length).toBe(2);
    // Member accounts are informational rows — present, no edit checkboxes of their own.
    expect(within(clinicCard).getByText("Yinghua Xu")).toBeInTheDocument();
    expect(within(clinicCard).getByText("Ava Lim")).toBeInTheDocument();
    expect(within(clinicCard).getAllByText("Member account").length).toBe(2);
    // The independent nurse belongs to no clinic — not staff.
    expect(within(clinicCard).queryByText("Indie Nurse")).not.toBeInTheDocument();
  });

  it("excludes prescriber-only doctors from a clinic's staff", async () => {
    relationships = [
      rel({ id: "u-voss_clinic_clinic-lumiere", doctorID: "u-voss", doctorName: "Dr Elena Voss", counterpartyType: "clinic", counterpartyID: "clinic-lumiere", counterpartyName: "Lumière Clinic", relationshipKinds: ["prescriber"] }),
    ];
    accounts = [];
    await renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Employment" }));
    const clinicCard = screen.getByText("Lumière Clinic", { selector: "h3" }).closest("div")!;
    expect(within(clinicCard).queryByText("Dr Elena Voss")).not.toBeInTheDocument();
    expect(within(clinicCard).getByText("No staff yet.")).toBeInTheDocument();
  });

  it("lists a staffless clinic from the directory with an empty state", async () => {
    clinicDirectory = [...clinicDirectory, { id: "clinic-empty", label: "Bare Clinic" }];
    await renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Employment" }));
    const bare = screen.getByText("Bare Clinic", { selector: "h3" }).closest("div")!;
    expect(within(bare).getByText("No staff yet.")).toBeInTheDocument();
  });

  it("edits a dual-kind relationship through the same record shown in Prescribing", async () => {
    await renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Employment" }));
    const clinicCard = screen.getByText("Lumière Clinic", { selector: "h3" }).closest("div")!;
    const vossRow = within(clinicCard).getByText("Dr Elena Voss").closest("li")!;
    await userEvent.click(within(vossRow).getByRole("button", { name: "Prescriber" }));
    expect(setCooperationRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ counterpartyID: "clinic-lumiere", doctorID: "u-voss", relationshipKinds: ["employee"] }),
      admin,
    );
  });
});
