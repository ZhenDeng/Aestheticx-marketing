import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyState } from "@/lib/demo/backend";
import type { Identity } from "@/lib/demo/types";
import type { Invoice } from "@/lib/demo/invoicing";

// 16/07 feedback enhancement 2: the doctor picks WHICH authorisations an invoice bills
// (checkbox per script, all on by default — untick a freebie), and can delete a generated
// invoice (confirmation required) so its scripts return to the pool for regeneration.

const voss: Identity = { user: { id: "u-voss", name: "Dr Elena Voss" }, role: "doctor", context: { kind: "independent" } };
const NOW = Date.UTC(2026, 6, 16); // July 2026

// Three item-authorisations forming TWO scripts: r1 has two items, r2 one.
const ROW_A1 = { id: "a1", requestID: "r1", counterpartyID: "u-sarah", counterpartyType: "nurse" as const, monthKey: "2026-05", dateISO: "2026-07-10", patientName: "Amara Boyd", invoiced: false };
const ROW_A2 = { id: "a2", requestID: "r1", counterpartyID: "u-sarah", counterpartyType: "nurse" as const, monthKey: "2026-05", dateISO: "2026-07-10", patientName: "Amara Boyd", invoiced: false };
const ROW_B1 = { id: "b1", requestID: "r2", counterpartyID: "u-sarah", counterpartyType: "nurse" as const, monthKey: "2026-05", dateISO: "2026-07-12", patientName: "Noah Reid", invoiced: false };
// Mutable so a test can simulate a live re-hydrate reordering state.authorisations.
let billableRows: Array<typeof ROW_A1> = [ROW_A1, ROW_A2, ROW_B1];

const invoice: Invoice = {
  id: "inv-1", doctorID: "u-voss", counterpartyID: "u-sarah", counterpartyType: "nurse",
  periodLabel: "June 2026", lines: [], subtotalCents: 9000, gstCents: 900, totalCents: 9900,
  authorisationIDs: ["z1"], createdAt: NOW - 1000, paid: false,
};

const generateInvoice = vi.fn();
const deleteInvoice = vi.fn();
let invoices: Invoice[];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity: voss, availableIdentities: [voss], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    state: emptyState(),
    now: NOW,
    status: "ready" as const,
    // A PAST month so only the historical grid renders (no "This month" duplicate row) —
    // keeps exactly one "Generate invoice" toggle for the panel-open assertions.
    billingSummary: () => ({
      totalCount: 3,
      months: [{ monthKey: "2026-05", count: 3, byParty: [{ type: "nurse" as const, id: "u-sarah", count: 3 }] }],
    }),
    invoicesFor: () => invoices,
    billableAuthorisations: () => billableRows,
    scriptPrice: () => 2500,
    setScriptPrice: vi.fn(),
    generateInvoice,
    deleteInvoice,
    markInvoicePaid: vi.fn(),
    customTimeframeCount: () => 0,
    clinicBusinessStats: () => null,
  }),
}));

import BillingPage from "@/app/app/billing/page";

beforeEach(() => {
  generateInvoice.mockReset();
  deleteInvoice.mockReset();
  invoices = [invoice];
  billableRows = [ROW_A1, ROW_A2, ROW_B1];
});

async function openPanel() {
  render(<BillingPage />);
  await userEvent.click(screen.getAllByRole("button", { name: /generate invoice/i })[0]);
}

describe("Billing — selective invoicing (16/07 enhancement 2)", () => {
  it("lists each un-invoiced script with a checkbox, all selected by default", async () => {
    await openPanel();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2); // two scripts, not three items
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/2 of 2 selected/i)).toBeInTheDocument();
  });

  it("unticking a script excludes it: totals track the selection and generation sends only its member ids", async () => {
    await openPanel();
    await userEvent.click(screen.getByRole("checkbox", { name: /amara boyd/i }));
    expect(screen.getByText(/1 of 2 selected/i)).toBeInTheDocument();
    // One selected script: it appears as both the line total and the footer total in the preview table.
    expect(screen.getAllByText(/\$27\.50/).length).toBeGreaterThanOrEqual(1);
    // Two "Generate invoice" buttons exist (the row toggle + the panel submit); the panel's is last.
    const generateButtons = screen.getAllByRole("button", { name: /^generate invoice$/i });
    await userEvent.click(generateButtons[generateButtons.length - 1]);
    expect(generateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ authIDs: ["b1"] }),
      voss,
    );
  });

  // Regression (engineer review, 16/07): a live re-hydrate replaces state.authorisations and
  // Firestore gives no stable order. An order-sensitive reset would silently re-tick a script
  // the doctor deliberately excluded → a mis-bill. The untick must survive a reorder.
  it("keeps an untick when the billable set is re-ordered underneath (live re-hydrate)", async () => {
    const { rerender } = render(<BillingPage />);
    await userEvent.click(screen.getAllByRole("button", { name: /generate invoice/i })[0]);
    await userEvent.click(screen.getByRole("checkbox", { name: /amara boyd/i }));
    expect(screen.getByText(/1 of 2 selected/i)).toBeInTheDocument();
    // Same SET of scripts, different order (as a fresh Firestore read may return them).
    billableRows = [ROW_B1, ROW_A2, ROW_A1];
    rerender(<BillingPage />);
    // The Amara Boyd untick must persist — not silently re-selected.
    expect(screen.getByText(/1 of 2 selected/i)).toBeInTheDocument();
    expect((screen.getByRole("checkbox", { name: /amara boyd/i }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: /noah reid/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("cannot generate with nothing selected", async () => {
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: /select none/i }));
    const generateButtons = screen.getAllByRole("button", { name: /^generate invoice$/i });
    expect(generateButtons[generateButtons.length - 1]).toBeDisabled();
    expect(generateInvoice).not.toHaveBeenCalled();
  });

  // 17/07 feedback: the preview must be a formal bordered grid — outer frame + column
  // dividers matching the PDF — not loose lines. Checkbox selection stays untouched.
  it("frames the preview table with an outer border and column dividers", async () => {
    await openPanel();
    const table = screen.getByRole("table");
    expect(table.className).toMatch(/border-line/); // outer frame in the theme line token
    expect(table.className).toMatch(/(^|\s)border(\s|$)/);
    const headerCells = within(table).getAllByRole("columnheader");
    expect(headerCells.length).toBe(5); // Description / Qty / Unit / GST / Total
    for (const cell of headerCells.slice(1)) expect(cell.className).toMatch(/border-l/);
    // Grid rows (tbody): every cell after the description carries a left divider.
    for (const row of Array.from((table as HTMLTableElement).tBodies[0].rows)) {
      for (const cell of Array.from(row.cells).slice(1)) expect(cell.className).toMatch(/border-l/);
    }
    // The TOTAL row (tfoot) carries the bold accent.
    const footCells = Array.from((table as HTMLTableElement).tFoot!.rows).flatMap((r) => Array.from(r.cells));
    const totalLabel = footCells.find((c) => c.textContent === "Total");
    expect(totalLabel?.className).toMatch(/font-medium/);
  });

  it("deleting an invoice asks first, then routes through the store", async () => {
    render(<BillingPage />);
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(deleteInvoice).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /delete invoice/i }));
    expect(deleteInvoice).toHaveBeenCalledWith("inv-1", voss);
  });
});
