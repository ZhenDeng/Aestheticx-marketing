import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

// A sandbox tab holds a DEMO identity whose uid exists only in the seed. The incoming-ring
// listener used to gate on isFirebaseConfigured() alone, so on a Firebase-configured
// deployment it would open a Firestore subscription on consultSignals/{fake-uid} — real
// unauthorised traffic, and permission-denied errors in the console. It must follow the
// provider's mode like every other consumer.
vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => true, firestore: () => ({}) }));

const onSnapshot = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("firebase/firestore", () => ({ doc: () => ({}), onSnapshot }));

const NURSE = DEMO_ACCOUNTS[0].identities[0];

let mode: "demo" | "live" = "demo";
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ mode, identity: NURSE, availableIdentities: [NURSE] }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({ startConsult: vi.fn(), state: { requests: {}, patients: {} } }),
}));

import { ConsultCallProvider } from "@/components/app/ConsultCall";

function renderProvider(children: ReactNode = null) {
  return render(<ConsultCallProvider>{children}</ConsultCallProvider>);
}

beforeEach(() => { onSnapshot.mockClear(); });

describe("ConsultCallProvider incoming-ring listener", () => {
  it("opens no Firestore subscription in a sandbox tab", async () => {
    mode = "demo";
    await act(async () => { renderProvider(); });
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("still subscribes in a live session", async () => {
    mode = "live";
    await act(async () => { renderProvider(); });
    expect(onSnapshot).toHaveBeenCalled();
  });
});
