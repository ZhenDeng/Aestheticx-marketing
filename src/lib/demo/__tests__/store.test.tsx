import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { MedicationItem } from "@/lib/demo/types";
import { DemoStoreProvider, useDemoStore } from "@/lib/demo/store";
import { DemoAuthProvider } from "@/lib/demo/auth";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

const juvederm: MedicationItem = {
  name: "Juvederm", dosage: "1 mL", category: "haFiller", unit: "millilitres", areas: ["Chin"],
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoStoreProvider>{children}</DemoStoreProvider>
    </DemoAuthProvider>
  );
}

describe("useDemoStore", () => {
  it("starts from the seed and approves a pending request", () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    const voss = DEMO_ACCOUNTS[2].identities[0];

    const pending = result.current.pendingRequestsForDoctor("u-voss");
    expect(pending.length).toBeGreaterThanOrEqual(1);

    act(() => {
      result.current.approveRequest(pending[0].id, voss);
    });

    expect(result.current.pendingRequestsForDoctor("u-voss").length).toBe(pending.length - 1);
  });

  it("withdraws an open request and revokes the reviewer grant", () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    const sarah = DEMO_ACCOUNTS[0].identities[0]; // the raising nurse

    const pending = result.current.pendingRequestsForDoctor("u-voss");
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const target = pending[0];
    expect(result.current.state.patients[target.patientID].openReviewerDoctorIDs).toContain("u-voss");

    act(() => {
      result.current.withdrawRequest(target.id, sarah);
    });

    expect(result.current.state.requests[target.id].status).toBe("withdrawn");
    expect(result.current.pendingRequestsForDoctor("u-voss").length).toBe(pending.length - 1);
    // Invariant: the doctor stays a reviewer only while a pending/needsEdit request remains.
    const stillOpen = Object.values(result.current.state.requests).some(
      (r) => r.patientID === target.patientID && r.doctorID === "u-voss"
        && (r.status === "pending" || r.status === "needsEdit"),
    );
    expect((result.current.state.patients[target.patientID].openReviewerDoctorIDs ?? []).includes("u-voss")).toBe(stillOpen);
  });

  it("edits a pending request in place — items change, status stays pending (Tier 3 #7)", () => {
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    const sarah = DEMO_ACCOUNTS[0].identities[0]; // the raising nurse
    const target = result.current.pendingRequestsForDoctor("u-voss")[0];

    act(() => {
      result.current.editPendingRequest({ requestID: target.id, items: [juvederm], identity: sarah });
    });

    expect(result.current.state.requests[target.id].status).toBe("pending");
    expect(result.current.state.requests[target.id].items.map((i) => i.name)).toEqual(["Juvederm"]);
  });

  it("throws OUTSIDE the setState updater when the doctor has already actioned the request", () => {
    // Guards the eager-validate contract (review HIGH): a doctor-approves-while-nurse-edits race
    // must throw synchronously in the event-handler context, NOT inside applyAndMirror's setState
    // updater (a render-phase crash with no error boundary in this tree).
    const { result } = renderHook(() => useDemoStore(), { wrapper });
    const sarah = DEMO_ACCOUNTS[0].identities[0];
    const voss = DEMO_ACCOUNTS[2].identities[0];
    const target = result.current.pendingRequestsForDoctor("u-voss")[0];

    act(() => { result.current.approveRequest(target.id, voss); }); // doctor acts first

    // The call itself throws (eager validate) — not deferred into a render-phase updater.
    expect(() =>
      result.current.editPendingRequest({ requestID: target.id, items: [juvederm], identity: sarah }),
    ).toThrow();
    // Store is intact; the request stayed approved (no phantom optimistic write).
    expect(result.current.state.requests[target.id].status).toBe("approved");
  });
});
