// Nurse clinic employment in the Employment view (spec: 2026-07-25). Admins add a nurse to a
// clinic (grant) and remove grant-backed members; baked members stay read-only.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClinicEmployment, CooperationRelationship, Identity } from "@/lib/demo/types";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };

const setClinicEmployment = vi.fn();
let relationships: CooperationRelationship[] = [];
let clinicDirectory: { id: string; label: string; unnamed?: boolean }[] = [];
let accounts: { id: string; name: string; email: string; roles: string[]; clinicIDs?: string[]; mustChangePassword: boolean }[] = [];
let clinicEmployments: ClinicEmployment[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: admin, availableIdentities: [admin], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    accounts: () => accounts,
    cooperationRelationships: () => relationships,
    relationshipAuditFor: () => [],
    clinics: () => clinicDirectory,
    listDoctors: () => Promise.resolve([]),
    setCooperationRelationship: vi.fn(),
    removeCooperationRelationship: vi.fn(),
    clinicEmployments: () => clinicEmployments,
    setClinicEmployment,
  }),
}));

import { CooperationRelationshipsSection } from "@/components/admin/RelationshipsSection";

async function openEmployment() {
  render(<CooperationRelationshipsSection />);
  await act(async () => {});
  await userEvent.click(screen.getByRole("button", { name: "Employment" }));
}

beforeEach(() => {
  setClinicEmployment.mockReset();
  relationships = [];
  clinicDirectory = [{ id: "clinic-lumiere", label: "Lumière Clinic" }];
  accounts = [
    { id: "u-ruby", name: "Ruby Walsh", email: "", roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false }, // baked member (no grant)
    { id: "u-indie", name: "Indie Nurse", email: "", roles: ["nurse"], clinicIDs: [], mustChangePassword: false },              // addable
  ];
  clinicEmployments = [];
});

describe("Employment view — nurse clinic employment", () => {
  it("adds a nurse as an employee via the picker", async () => {
    await openEmployment();
    const card = screen.getByText("Lumière Clinic").closest("div")!;
    await userEvent.selectOptions(within(card).getByLabelText(/add employee/i), "u-indie");
    await userEvent.click(within(card).getByRole("button", { name: /^Add$/ }));
    expect(setClinicEmployment).toHaveBeenCalledWith(
      { nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", employed: true },
      admin,
    );
  });

  it("removes a grant-backed nurse member", async () => {
    clinicEmployments = [{ id: "u-indie_clinic-lumiere", nurseID: "u-indie", nurseName: "Indie Nurse", clinicID: "clinic-lumiere", clinicName: "Lumière Clinic", grantedAt: 1 }];
    accounts = [
      { id: "u-ruby", name: "Ruby Walsh", email: "", roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false },
      { id: "u-indie", name: "Indie Nurse", email: "", roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false },
    ];
    await openEmployment();
    const indieRow = screen.getByText("Indie Nurse").closest("li")!;
    await userEvent.click(within(indieRow).getByRole("button", { name: /remove/i }));
    await userEvent.click(within(indieRow).getByRole("button", { name: /confirm/i }));
    expect(setClinicEmployment).toHaveBeenCalledWith(
      expect.objectContaining({ nurseID: "u-indie", clinicID: "clinic-lumiere", employed: false }),
      admin,
    );
  });

  it("leaves a baked member (no grant) read-only — no Remove button", async () => {
    await openEmployment();
    const rubyRow = screen.getByText("Ruby Walsh").closest("li")!;
    expect(within(rubyRow).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(within(rubyRow).getByText(/member account/i)).toBeInTheDocument();
  });

  it("shows the Add-employee picker on a staffless clinic card too", async () => {
    clinicDirectory = [...clinicDirectory, { id: "clinic-bare", label: "Bare Clinic" }];
    await openEmployment();
    const bareCard = screen.getByText("Bare Clinic").closest("div")!;
    expect(within(bareCard).getByLabelText(/add employee/i)).toBeInTheDocument();
  });

  it("offers only non-member nurses in the Add-employee picker", async () => {
    accounts = [
      { id: "u-ruby", name: "Ruby Walsh", email: "", roles: ["nurse"], clinicIDs: ["clinic-lumiere"], mustChangePassword: false }, // already a member
      { id: "u-indie", name: "Indie Nurse", email: "", roles: ["nurse"], clinicIDs: [], mustChangePassword: false },              // not a member
    ];
    await openEmployment();
    const card = screen.getByText("Lumière Clinic").closest("div")!;
    const select = within(card).getByLabelText(/add employee/i);
    const options = within(select).getAllByRole("option");
    expect(options.length).toBe(1);
    expect(options[0]).toHaveTextContent("Indie Nurse");
  });
});
