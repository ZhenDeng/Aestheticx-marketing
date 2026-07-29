// 28/07 feedback: the request builder's Timing is no longer free text — the field is
// disabled, shows the fixed value, and every line is created with it stamped.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Suspense } from "react";
import { REQUEST_ITEM_TIMING } from "@/lib/demo/requestBuilder";
import type { Identity, Patient } from "@/lib/demo/types";

const nurse: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };

const patient: Patient = {
  id: "p-1", givenName: "Amara", lastName: "Boyd",
  dateOfBirth: { year: 1991, month: 3, day: 12 }, gender: "Female",
  address: "x", phone: "0401", email: "a@x.com", allergies: "", currentMedications: "",
  owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [],
};

const submitRequest = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: nurse }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "demo" as const,
    state: { requests: {}, patients: { "p-1": patient }, productsByID: {} },
    cooperatingDoctors: () => [{ doctorId: "u-voss", doctorName: "Dr Elena Voss" }],
    submitRequest,
    editPendingRequest: vi.fn(),
    resubmitRequest: vi.fn(),
  }),
}));

import RequestBuilderPage from "@/app/app/patients/[id]/request/page";

async function renderBuilder() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <RequestBuilderPage params={Promise.resolve({ id: "p-1" })} />
      </Suspense>,
    );
    await Promise.resolve();
  });
}

async function addFirstSearchResult(query: string) {
  fireEvent.change(screen.getByPlaceholderText("Search all products…"), { target: { value: query } });
  const result = (await screen.findAllByRole("button")).find((b) => b.textContent?.includes(query));
  expect(result).toBeDefined();
  await act(async () => { fireEvent.click(result!); });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("request builder — fixed item timing", () => {
  it("shows the fixed timing as plain text — no input, no '(optional)'", async () => {
    await renderBuilder();
    await addFirstSearchResult("Botox");
    // Plain text (28/07 follow-up: no bordered/filled field), so no input carries the value.
    expect(screen.getByText(REQUEST_ITEM_TIMING)).toBeTruthy();
    expect(screen.queryByDisplayValue(REQUEST_ITEM_TIMING)).toBeNull();
    expect(screen.getByText("Timing")).toBeTruthy();
    expect(screen.queryByText(/optional/i)).toBeNull();
  });

  it("stamps the fixed timing on every submitted item", async () => {
    await renderBuilder();
    await addFirstSearchResult("Botox");
    // Complete the line: dosage + route (submit gate), doctor is preselected when only one.
    const dosage = document.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(dosage, { target: { value: "48" } }); });
    const route = screen.getByLabelText("Route of administration") as HTMLSelectElement;
    await act(async () => { fireEvent.change(route, { target: { value: "intramuscular" } }); });
    expect(dosage.value).toBe("48");
    expect(route.value).toBe("intramuscular");
    const submit = screen.getByRole("button", { name: "Submit request" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    await act(async () => { fireEvent.click(submit); });
    expect(submitRequest).toHaveBeenCalledTimes(1);
    const { items } = submitRequest.mock.calls[0][0];
    expect(items).toHaveLength(1);
    expect(items[0].timing).toBe(REQUEST_ITEM_TIMING);
  });
});
