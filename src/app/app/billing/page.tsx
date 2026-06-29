"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { partyLabel, monthLabel } from "@/lib/demo/billing";
import { formatAUD, computeInvoice, GST_RATE, DEFAULT_SCRIPT_PRICE_CENTS } from "@/lib/demo/invoicing";
import { DEMO_ACCOUNTS, LUMIERE } from "@/lib/demo/accounts";

export default function BillingPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [openPanel, setOpenPanel] = useState<string | null>(null); // `${monthKey}:${counterpartyID}`
  const [priceInput, setPriceInput] = useState<string>("");

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const me = identity;
  const isLive = store.status !== "demo";
  const isDoctor = me.role === "doctor";
  const summary = store.billingSummary(me);
  const invoices = store.invoicesFor(me);
  const heading = isDoctor ? "Authorisations you can bill" : "Billable to you";
  const partyNoun = isDoctor ? "Counterparty" : "Prescribing doctor";

  function openGenerate(monthKey: string, counterpartyID: string) {
    setOpenPanel(`${monthKey}:${counterpartyID}`);
    setPriceInput((store.scriptPrice(me.user.id, counterpartyID) / 100).toFixed(2));
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink">Billing</h1>
      <p className="mt-1 text-ink-soft">{heading}</p>

      <div className="mt-5 rounded-card border border-line bg-card p-5 shadow-card">
        <span className="micro">Total billable authorisations</span>
        <p className="mt-1 font-display text-4xl text-ink">{summary.totalCount}</p>
      </div>

      {summary.months.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">No billable authorisations yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {summary.months.map((m) => (
            <div key={m.monthKey}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-xl text-ink">{monthLabel(m.monthKey)}</h2>
                <span className="micro">{m.count} total</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {m.byParty.map((p) => {
                  const panelKey = `${m.monthKey}:${p.id}`;
                  const canGenerate = isDoctor && (p.type === "nurse" || p.type === "clinic");
                  return (
                    <li key={`${p.type}:${p.id}`} className="rounded-inner border border-line bg-card px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink"><span className="micro mr-2">{partyNoun}</span>{partyLabel(p.type, p.id, DEMO_ACCOUNTS, LUMIERE)}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-sm font-medium text-ink">{p.count}</span>
                          {canGenerate && (
                            <button type="button" onClick={() => (openPanel === panelKey ? setOpenPanel(null) : openGenerate(m.monthKey, p.id))}
                              className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint">
                              Generate invoice
                            </button>
                          )}
                        </span>
                      </div>
                      {canGenerate && openPanel === panelKey && (
                        <GeneratePanel
                          monthKey={m.monthKey}
                          counterpartyID={p.id}
                          counterpartyType={p.type === "clinic" ? "clinic" : "nurse"}
                          priceInput={priceInput}
                          setPriceInput={setPriceInput}
                          onDone={() => setOpenPanel(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-10 font-display text-xl text-ink">Invoices</h2>
      {invoices.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No invoices yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between rounded-inner border border-line bg-card px-4 py-3">
              <span className="text-sm text-ink">
                {inv.periodLabel} · {partyLabel(isDoctor ? inv.counterpartyType : "doctor", isDoctor ? inv.counterpartyID : inv.doctorID, DEMO_ACCOUNTS, LUMIERE)}
                <span className="ml-2 font-medium">{formatAUD(inv.totalCents)}</span>
              </span>
              <InvoiceDownload pdfFileId={inv.pdfFileId} isLive={isLive} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GeneratePanel({ monthKey, counterpartyID, counterpartyType, priceInput, setPriceInput, onDone }: {
  monthKey: string; counterpartyID: string; counterpartyType: "nurse" | "clinic";
  priceInput: string; setPriceInput: (v: string) => void; onDone: () => void;
}) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const me = identity!;
  const rows = store.billableAuthorisations(me.user.id)
    .filter((r) => r.counterpartyID === counterpartyID && r.monthKey === monthKey && !r.invoiced);
  const storedPrice = store.scriptPrice(me.user.id, counterpartyID);
  const previewPrice = Math.round((parseFloat(priceInput) || 0) * 100) || storedPrice || DEFAULT_SCRIPT_PRICE_CENTS;
  const preview = rows.length > 0
    ? computeInvoice({ pricePerScriptCents: previewPrice, gstRate: GST_RATE, authorisations: rows.map((r) => ({ id: r.id, dateISO: r.dateISO, patientName: r.patientName })) })
    : null;

  function savePrice() {
    const cents = Math.round((parseFloat(priceInput) || 0) * 100);
    if (cents > 0) store.setScriptPrice(counterpartyID, cents, me);
  }
  function generate() {
    if (rows.length === 0) return;
    store.generateInvoice({ doctorID: me.user.id, counterpartyID, counterpartyType, periodLabel: monthLabel(monthKey), authIDs: rows.map((r) => r.id) }, me);
    onDone();
  }

  return (
    <div className="mt-3 rounded-inner border border-line p-3">
      <p className="text-sm text-ink-soft">{rows.length} selectable authorisation{rows.length === 1 ? "" : "s"}.</p>
      <div className="mt-2 flex items-end gap-2">
        <label className="block">
          <span className="micro">Price per script (AUD)</span>
          <input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} inputMode="decimal"
            className="mt-1 w-28 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
        </label>
        <button type="button" onClick={savePrice} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Save price</button>
      </div>
      {preview && (
        <p className="mt-2 text-sm text-ink-soft">
          Subtotal {formatAUD(preview.subtotalCents)} · GST {formatAUD(preview.gstCents)} · <span className="font-medium text-ink">Total {formatAUD(preview.totalCents)}</span>
        </p>
      )}
      <div className="mt-3">
        <button type="button" onClick={generate} disabled={rows.length === 0}
          className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          Generate invoice
        </button>
      </div>
    </div>
  );
}

function InvoiceDownload({ pdfFileId, isLive }: { pdfFileId?: string; isLive: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!isLive) {
    return <span className="text-xs text-ink-soft">PDF available in live mode</span>;
  }
  async function download() {
    if (!pdfFileId) return;
    setBusy(true);
    try { const { invoicePdfUrl } = await import("@/lib/firebase/invoices"); window.open(await invoicePdfUrl(pdfFileId), "_blank", "noopener"); }
    catch { /* surfaced via the sync-error banner */ }
    finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={download} disabled={!pdfFileId || busy}
      className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint disabled:opacity-50">
      {busy ? "Opening…" : pdfFileId ? "Download PDF" : "Preparing…"}
    </button>
  );
}
