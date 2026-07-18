// Patient file "Account" section (design-ui.md §1–3): silo-scoped wallet balance,
// gift-credit top-ups, and scenario-routed checkout. The store mock runs the REAL
// reducers over seed state inside React state, so interactions exercise true behavior.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import * as backend from "@/lib/demo/backend";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { buildSeedState, SEED_NOW } from "@/lib/demo/seed";
import { LUMIERE } from "@/lib/demo/accounts";
import { fullName, ownerKeyOf, type DemoState, type Identity, type Patient } from "@/lib/demo/types";

// One shared mutable state for every useDemoStore() call in the tree (a per-hook
// useState would give each component its own diverging copy).
let demoState: DemoState = buildSeedState();
const listeners = new Set<() => void>();
function applyState(updater: (s: DemoState) => DemoState) {
  demoState = updater(demoState);
  for (const l of listeners) l();
}

const sarahIndependent: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
const sarahClinic: Identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const ruby: Identity = { user: { id: "u-ruby", name: "Ruby Walsh" }, role: "nurse", context: { kind: "clinic", clinic: LUMIERE } };
const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };

let currentIdentity: Identity = sarahIndependent;

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: currentIdentity, availableIdentities: [currentIdentity], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => {
    const state = useSyncExternalStore(
      (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      () => demoState,
    );
    return {
      state,
      now: SEED_NOW,
      status: "demo" as const,
      matrixEnabled: true,
      patientAccess: (p: Patient, id: Identity) => patientAccessLevel(state, id, p),
      walletEntries: (pid: string) => state.walletByPatientID[pid] ?? [],
      walletBalance: (pid: string) => backend.walletBalanceCents(state, pid),
      priceListFor: (owner: Patient["owner"]) => state.priceListByOwner[ownerKeyOf(owner)] ?? [],
      topUpWallet: (input: backend.TopUpWalletInput, id: Identity) => applyState((s) => backend.topUpWallet(s, input, id, SEED_NOW)),
      checkoutClient: (input: backend.CheckoutClientInput, id: Identity) => applyState((s) => backend.checkoutClient(s, input, id, SEED_NOW)),
      finalizeServiceFee: vi.fn(),
    };
  },
}));

import { PatientAccountSection } from "@/components/app/PatientAccount";

function seedPatient(name: string): Patient {
  const p = Object.values(buildSeedState().patients).find((x) => fullName(x) === name);
  if (!p) throw new Error(`missing seed patient ${name}`);
  return p;
}

beforeEach(() => {
  currentIdentity = sarahIndependent;
  demoState = buildSeedState();
});

describe("PatientAccountSection — visibility", () => {
  it("renders the balance card with the owning-silo chip for the owner", () => {
    render(<PatientAccountSection patient={seedPatient("Claire Donovan")} />);
    expect(screen.getByText(/account balance/i)).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("Sarah Chen")).toBeInTheDocument(); // silo chip
  });

  it("renders nothing for an identity without commercial access", () => {
    currentIdentity = ruby;
    const { container } = render(<PatientAccountSection patient={seedPatient("Claire Donovan")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("collaborating doctor gets checkout but not top-up on a clinic client", () => {
    currentIdentity = voss;
    render(<PatientAccountSection patient={seedPatient("Amara Boyd")} />);
    expect(screen.getByRole("button", { name: /checkout/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /top up/i })).not.toBeInTheDocument();
  });
});

describe("PatientAccountSection — top-up (spec: patient-wallet)", () => {
  it("shows the live total, credits the balance, and flags the gift in history", async () => {
    render(<PatientAccountSection patient={seedPatient("Claire Donovan")} />);
    await userEvent.click(screen.getByRole("button", { name: /top up/i }));
    await userEvent.type(screen.getByLabelText(/paid amount/i), "4000");
    await userEvent.type(screen.getByLabelText(/gift credit/i), "1000");
    expect(screen.getByText(/total credit added/i)).toBeInTheDocument();
    expect(screen.getByText("$5,000.00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /top up & issue invoice/i }));
    // Balance card shows the credited total…
    expect(await screen.findAllByText("$5,000.00")).not.toHaveLength(0);
    // …and the history row separates cash from the gift flag.
    const history = screen.getByTestId("wallet-history");
    expect(within(history).getByText(/\+\$4,000\.00/)).toBeInTheDocument();
    expect(within(history).getByText(/\$1,000\.00 gift/i)).toBeInTheDocument();
  });

  it("disables confirm until an amount is entered", async () => {
    render(<PatientAccountSection patient={seedPatient("Claire Donovan")} />);
    await userEvent.click(screen.getByRole("button", { name: /top up/i }));
    expect(screen.getByRole("button", { name: /top up & issue invoice/i })).toBeDisabled();
  });
});

describe("PatientAccountSection — checkout (spec: client-checkout)", () => {
  it("Scenario A: announces the operator's own silo as issuer and totals the selection", async () => {
    render(<PatientAccountSection patient={seedPatient("Claire Donovan")} />);
    await userEvent.click(screen.getByRole("button", { name: /^checkout$/i }));
    expect(screen.getByText(/billing as/i)).toHaveTextContent("Sarah Chen");
    await userEvent.click(screen.getByRole("checkbox", { name: /skin booster session/i }));
    // GST-inclusive $450.00 with GST $40.91 shown per line AND in the totals row.
    expect(screen.getAllByText("$450.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$40.91")).toHaveLength(2);
  });

  it("Scenario B: names the clinic as issuer and notes the drafted service fee", async () => {
    currentIdentity = sarahClinic;
    render(<PatientAccountSection patient={seedPatient("Amara Boyd")} />);
    await userEvent.click(screen.getByRole("button", { name: /^checkout$/i }));
    expect(screen.getByText(/billing as/i)).toHaveTextContent("Lumière");
    await userEvent.click(screen.getByRole("checkbox", { name: /anti-wrinkle/i }));
    expect(screen.getByText(/service-fee invoice .* \$150\.00/i)).toBeInTheDocument();
  });

  it("settles from the wallet when the balance covers the total", async () => {
    render(<PatientAccountSection patient={seedPatient("Claire Donovan")} />);
    // Fund the wallet first.
    await userEvent.click(screen.getByRole("button", { name: /top up/i }));
    await userEvent.type(screen.getByLabelText(/paid amount/i), "800");
    await userEvent.click(screen.getByRole("button", { name: /top up & issue invoice/i }));

    await userEvent.click(screen.getByRole("button", { name: /^checkout$/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /skin booster session/i }));
    const payFromWallet = screen.getByRole("checkbox", { name: /pay from account balance/i });
    expect(payFromWallet).toBeEnabled();
    await userEvent.click(payFromWallet);
    await userEvent.click(screen.getByRole("button", { name: /confirm checkout/i }));
    // $800 − $450 = $350 remaining, and the drawdown lands in history.
    expect(await screen.findByText("$350.00")).toBeInTheDocument();
    const history = screen.getByTestId("wallet-history");
    expect(within(history).getByText(/−\$450\.00/)).toBeInTheDocument();
  });

  it("offers no wallet payment when the balance is short", async () => {
    render(<PatientAccountSection patient={seedPatient("Claire Donovan")} />);
    await userEvent.click(screen.getByRole("button", { name: /^checkout$/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /skin booster session/i }));
    expect(screen.getByRole("checkbox", { name: /pay from account balance/i })).toBeDisabled();
  });
});
