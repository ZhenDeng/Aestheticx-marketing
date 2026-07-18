"use client";

// Patient file "Account" section (change: multi-tenant-billing-matrix, design-ui.md §1–3):
// the silo-scoped wallet balance card with top-up (owner only) and checkout (owner or
// collaborating practitioner), plus the differentiated ledger history. The scenario is
// always DERIVED from the client's owner and announced, never chosen.
import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { ownerDisplayLabel, DEFAULT_SERVICE_FEE_CENTS } from "@/lib/demo/backend";
import { computeInclusiveTotals, formatAUD } from "@/lib/demo/invoicing";
import { invoiceNumber } from "@/lib/demo/invoicePdf";
import type { Identity, Patient, PriceListItem, WalletEntry } from "@/lib/demo/types";

function centsFromInput(v: string): number {
  const cents = Math.round((parseFloat(v) || 0) * 100);
  return cents > 0 ? cents : 0;
}

/** The gold promotional-gift token (design-ui.md: never mixed into the cash figure). */
function GiftChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="micro rounded-full px-2 py-0.5" style={{ background: "var(--color-gold-soft)", color: "var(--color-gold-deep)" }}>
      {children}
    </span>
  );
}

export function PatientAccountSection({ patient }: { patient: Patient }) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [openPanel, setOpenPanel] = useState<"topup" | "checkout" | null>(null);
  if (!identity || !store.matrixEnabled) return null;
  const access = store.patientAccess(patient, identity);
  if (access === "none") return null;

  const balance = store.walletBalance(patient.id);
  const entries = store.walletEntries(patient.id);
  const siloLabel = ownerDisplayLabel(store.state, patient.owner);

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl text-ink">Account</h2>
      <div className="mt-3 rounded-card border border-line bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <span className="micro">Account balance</span>
          {/* The isolation story made visible: the credit lives under THIS silo and nowhere else. */}
          <span className="micro rounded-full border border-line px-2 py-0.5 text-ink-soft">{siloLabel}</span>
        </div>
        <p className="mt-1 font-display text-4xl text-ink">{formatAUD(balance)}</p>
        <div className="mt-3 flex gap-2">
          {access === "owner" && (
            <button type="button" onClick={() => setOpenPanel(openPanel === "topup" ? null : "topup")}
              className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
              Top up
            </button>
          )}
          <button type="button" onClick={() => setOpenPanel(openPanel === "checkout" ? null : "checkout")}
            className="rounded-btn border border-line px-4 py-2 text-sm text-ink hover:border-tint">
            Checkout
          </button>
        </div>
        {openPanel === "topup" && (
          <TopUpPanel patient={patient} identity={identity} onDone={() => setOpenPanel(null)} />
        )}
        {openPanel === "checkout" && (
          <CheckoutPanel patient={patient} identity={identity} balance={balance} onDone={() => setOpenPanel(null)} />
        )}
        <WalletHistory entries={entries} />
      </div>
    </section>
  );
}

function TopUpPanel({ patient, identity, onDone }: { patient: Patient; identity: Identity; onDone: () => void }) {
  const store = useDemoStore();
  const [paidInput, setPaidInput] = useState("");
  const [giftInput, setGiftInput] = useState("");
  const paidCents = centsFromInput(paidInput);
  const giftCents = centsFromInput(giftInput);
  const totalCents = paidCents + giftCents;

  function confirm() {
    if (totalCents <= 0) return;
    store.topUpWallet({ patientID: patient.id, paidCents, giftCents }, identity);
    onDone();
  }

  return (
    <div className="mt-4 rounded-inner border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="micro">Paid amount (实际支付)</span>
          <input value={paidInput} onChange={(e) => setPaidInput(e.target.value)} inputMode="decimal" placeholder="0.00"
            className="mt-1 block w-32 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
        </label>
        <label className="block">
          <span className="micro">Gift credit (赠送金额)</span>
          <input value={giftInput} onChange={(e) => setGiftInput(e.target.value)} inputMode="decimal" placeholder="0.00"
            className="mt-1 block w-32 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
        </label>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="micro">Total credit added (到账总额)</span>
        <span className="flex items-center gap-2">
          {giftCents > 0 && <GiftChip>☆ {formatAUD(giftCents)} gift</GiftChip>}
          <span className="font-display text-2xl text-ink">{formatAUD(totalCents)}</span>
        </span>
      </div>
      {/* GST note: the tax invoice charges only the PAID amount; the gift is a non-taxable footnote. */}
      {giftCents > 0 && paidCents > 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          The tax invoice will charge {formatAUD(paidCents)} (incl. GST); the {formatAUD(giftCents)} gift loads as non-taxable credit.
        </p>
      )}
      <div className="mt-3">
        <button type="button" onClick={confirm} disabled={totalCents <= 0}
          className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          Top up &amp; issue invoice
        </button>
      </div>
    </div>
  );
}

// Shared preview-grid cell classes (billing page parity: outer frame on the wrapper,
// left dividers on every non-first column, numerals right-aligned).
const CELL = "py-1.5 px-2";
const NUM_CELL = "border-l border-line py-1.5 px-2 text-right";

function CheckoutPanel({ patient, identity, balance, onDone }: {
  patient: Patient; identity: Identity; balance: number; onDone: () => void;
}) {
  const store = useDemoStore();
  const priceList = store.priceListFor(patient.owner);
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [payFromWallet, setPayFromWallet] = useState(false);
  const selected = priceList.filter((i) => (qtyByItem[i.id] ?? 0) > 0);
  const preview = selected.length > 0
    ? computeInclusiveTotals(selected.map((i) => ({ id: i.id, description: i.name, qty: qtyByItem[i.id], unitCents: i.priceCents })))
    : null;
  const total = preview?.totalCents ?? 0;
  const walletCovers = total > 0 && balance >= total;

  // Scenario banner data — the issuer is always the OWNING silo; a practitioner
  // operating on a clinic client additionally earns the drafted service fee.
  const issuerLabel = ownerDisplayLabel(store.state, patient.owner);
  const isOwnClient = patient.owner.kind !== "clinic";
  const practitionerFee = patient.owner.kind === "clinic" && (identity.role === "nurse" || identity.role === "doctor")
    ? store.state.serviceFeeCentsByPair[`${patient.owner.id}_${identity.user.id}`] ?? DEFAULT_SERVICE_FEE_CENTS
    : null;

  function toggle(item: PriceListItem) {
    setQtyByItem((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) > 0 ? 0 : 1 }));
  }
  function setQty(item: PriceListItem, qty: number) {
    setQtyByItem((prev) => ({ ...prev, [item.id]: Math.max(1, qty) }));
  }
  function confirm() {
    if (!preview) return;
    store.checkoutClient({
      patientID: patient.id,
      items: selected.map((i) => ({ itemID: i.id, qty: qtyByItem[i.id] })),
      payFromWallet,
    }, identity);
    onDone();
  }

  return (
    <div className="mt-4 rounded-inner border border-line p-3">
      <p className="micro">
        Billing as <span className="font-medium text-ink">{issuerLabel}</span>
        {isOwnClient ? " (your client)" : " — clinic client"}
      </p>
      {priceList.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No price list on file for this silo yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {priceList.map((item) => {
            const qty = qtyByItem[item.id] ?? 0;
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-inner px-1 py-1.5 text-sm hover:bg-[var(--color-tint-soft)]/40">
                <label className="flex min-w-0 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={qty > 0} onChange={() => toggle(item)}
                    aria-label={item.name} style={{ accentColor: "var(--color-tint)" }} />
                  <span className="min-w-0">
                    <span className="text-ink">{item.name}</span>
                    <span className="micro ml-2">{item.kind === "service" ? "Service" : "Product"}</span>
                  </span>
                </label>
                <span className="flex flex-none items-center gap-3">
                  {qty > 0 && (
                    <span className="flex items-center gap-1">
                      <button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => setQty(item, qty - 1)}
                        className="rounded-field border border-line px-2 text-xs text-ink-soft hover:border-tint">−</button>
                      <span className="w-5 text-center text-sm text-ink">{qty}</span>
                      <button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => setQty(item, qty + 1)}
                        className="rounded-field border border-line px-2 text-xs text-ink-soft hover:border-tint">+</button>
                    </span>
                  )}
                  <span className="text-sm text-ink">{formatAUD(item.priceCents)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {preview ? (
        <div className="mt-3 overflow-x-auto rounded-inner border border-line">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-line text-left">
                <th className={`${CELL} font-medium text-ink-soft`}>Description</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>Qty</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>Unit</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>GST</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((l) => (
                <tr key={l.authorisationID} className="border-b border-line">
                  <td className={`${CELL} text-ink`}>{l.description}</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>{l.qty}</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(l.unitCents ?? l.feeCents)}</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(l.gstCents)}</td>
                  <td className={`${NUM_CELL} text-ink`}>{formatAUD(l.feeCents + l.gstCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} />
                <td className={`${CELL} text-right text-ink-soft`}>Subtotal</td>
                <td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(preview.subtotalCents)}</td>
              </tr>
              <tr>
                <td colSpan={3} />
                <td className="py-0.5 px-2 text-right text-ink-soft">GST (10%)</td>
                <td className="border-l border-line py-0.5 px-2 text-right text-ink-soft">{formatAUD(preview.gstCents)}</td>
              </tr>
              <tr className="border-t-2 border-line">
                <td colSpan={3} />
                <td className={`${CELL} text-right font-medium text-ink`}>Total</td>
                <td className={`${NUM_CELL} font-medium text-ink`}>{formatAUD(preview.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Select at least one item.</p>
      )}
      <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={payFromWallet && walletCovers} disabled={!walletCovers}
          onChange={() => setPayFromWallet((v) => !v)}
          aria-label={`Pay from account balance (${formatAUD(balance)} available)`}
          style={{ accentColor: "var(--color-tint)" }} />
        <span className={walletCovers ? "text-ink" : "text-ink-soft"}>
          Pay from account balance ({formatAUD(balance)} available{!walletCovers && total > 0 ? ` — ${formatAUD(total - balance)} short` : ""})
        </span>
      </label>
      <div className="mt-3">
        <button type="button" onClick={confirm} disabled={!preview}
          className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          Confirm checkout
        </button>
      </div>
      {practitionerFee !== null && (
        <p className="mt-2 text-xs text-ink-soft">
          A service-fee invoice to {issuerLabel} for {formatAUD(practitionerFee)} will be drafted for you to review in Invoice.
        </p>
      )}
    </div>
  );
}

function WalletHistory({ entries }: { entries: WalletEntry[] }) {
  if (entries.length === 0) return null;
  const newestFirst = [...entries].reverse();
  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="wallet-history">
      <span className="micro">History</span>
      <ul className="mt-1 flex flex-col">
        {newestFirst.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm last:border-b-0">
            {e.kind === "topup" ? (
              <>
                <span className="min-w-0 text-ink">
                  Top-up
                  {e.invoiceID && <span className="ml-2 text-xs text-ink-soft">{invoiceNumber(e.invoiceID)}</span>}
                </span>
                <span className="flex flex-none items-center gap-2">
                  {e.paidCents > 0 && <span className="text-ink">+{formatAUD(e.paidCents)}</span>}
                  {e.giftCents > 0 && <GiftChip>☆ +{formatAUD(e.giftCents)} gift</GiftChip>}
                </span>
              </>
            ) : (
              <>
                <span className="min-w-0 text-ink-soft">
                  Checkout
                  <span className="ml-2 text-xs">{invoiceNumber(e.invoiceID)}</span>
                </span>
                <span className="flex-none text-ink-soft">−{formatAUD(e.amountCents)}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
