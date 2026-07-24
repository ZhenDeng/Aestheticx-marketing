"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { computeManualInvoice, formatAUD, type Invoice } from "@/lib/demo/invoicing";
import { InvoiceActions } from "@/components/app/InvoiceActions";
import type { Patient } from "@/lib/demo/types";

interface DraftLine { key: number; description: string; amount: string; }

// Monotonic draft-line keys: array indices shift when a middle line is removed, which would
// re-associate focus/IME state with the wrong row (ServiceInvoiceComposer precedent).
let nextLineKey = 1;
const emptyLine = (): DraftLine => ({ key: nextLineKey++, description: "", amount: "" });

// "330" / "1,000.50" → integer cents, or null when unparseable/non-positive.
function centsOf(amount: string): number | null {
  const dollars = Number(amount.replace(/,/g, "").trim());
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

const CELL = "py-1.5 px-2";
const NUM_CELL = "border-l border-line py-1.5 px-2 text-right";

// Manual client invoice (spec: manual client invoicing, 2026-07-24): a practitioner/clinic
// hand-types each line and bills the CLIENT. Two GST toggles pick the convention. Demo
// persists + returns the invoice; live returns a transient one — either way the PDF actions
// hand it to the practitioner's mail app / downloads. Renders nothing without access.
export function ClientInvoiceComposer({ patient, appointmentID, onIssued }: {
  patient: Patient; appointmentID?: string; onIssued?: (invoice: Invoice) => void;
}) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const [lines, setLines] = useState<DraftLine[]>(() => [emptyLine()]);
  const [chargeGst, setChargeGst] = useState(true);
  const [gstIncluded, setGstIncluded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Invoice | null>(null);

  if (!identity) return null;
  if (store.patientAccess(patient, identity) === "none") return null;

  const parsed = lines.map((l) => ({ description: l.description.trim(), cents: centsOf(l.amount) }));
  const previewable = parsed.filter((l) => l.cents !== null) as { description: string; cents: number }[];
  const preview = previewable.length > 0
    ? computeManualInvoice(
        previewable.map((l, i) => ({ id: `p${i}`, description: l.description, amountCents: l.cents })),
        { chargeGst, gstIncluded },
      )
    : null;

  function patch(index: number, p: Partial<DraftLine>) {
    setIssued(null);
    setError(null);
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...p } : row)));
  }

  function issue() {
    setError(null);
    setIssued(null);
    const out: { description: string; amountCents: number }[] = [];
    for (let i = 0; i < parsed.length; i++) {
      if (!parsed[i].description || parsed[i].cents === null) {
        setError(`Complete line ${i + 1} — a description and a positive amount.`);
        return;
      }
      out.push({ description: parsed[i].description, amountCents: parsed[i].cents! });
    }
    try {
      const invoice = store.createClientInvoice({ patientID: patient.id, lines: out, chargeGst, gstIncluded, appointmentID }, identity!);
      setLines([emptyLine()]);
      setIssued(invoice);
      onIssued?.(invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue the invoice");
    }
  }

  return (
    <div className="rounded-card border border-line bg-card p-5 shadow-card">
      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <div key={line.key} className="grid grid-cols-1 gap-2 rounded-field border border-line p-2.5 sm:grid-cols-[2fr_1fr_auto]">
            <input value={line.description} placeholder="Description of services" aria-label={`Line ${i + 1} description`}
              onChange={(e) => patch(i, { description: e.target.value })}
              className="rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint" />
            <input value={line.amount} placeholder="Price" inputMode="decimal" aria-label={`Line ${i + 1} amount`}
              onChange={(e) => patch(i, { amount: e.target.value })}
              className="rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint" />
            <button type="button" onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))} disabled={lines.length <= 1}
              className="text-sm text-ink-soft hover:text-ink disabled:opacity-40">Remove</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setLines((rows) => [...rows, emptyLine()])}
        className="mt-2 rounded-btn border border-line px-3 py-1 text-sm text-ink-soft hover:border-tint/50">Add line</button>

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={chargeGst} onChange={(e) => { setChargeGst(e.target.checked); setIssued(null); }}
            style={{ accentColor: "var(--color-tint)" }} />
          Charge GST (10%)
        </label>
        {chargeGst && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={gstIncluded} onChange={(e) => { setGstIncluded(e.target.checked); setIssued(null); }}
              style={{ accentColor: "var(--color-tint)" }} />
            Prices include GST
          </label>
        )}
      </div>

      {preview && (
        <div className="mt-3 overflow-x-auto rounded-inner border border-line">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-line text-left">
                <th className={`${CELL} font-medium text-ink-soft`}>Description</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>Unit</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>GST</th>
                <th className={`${NUM_CELL} font-medium text-ink-soft`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((l) => (
                <tr key={l.authorisationID} className="border-b border-line">
                  <td className={`${CELL} text-ink`}>{l.description}</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(l.unitCents ?? l.feeCents)}</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(l.gstCents)}</td>
                  <td className={`${NUM_CELL} text-ink`}>{formatAUD(l.feeCents + l.gstCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2} /><td className={`${CELL} text-right text-ink-soft`}>Subtotal</td><td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(preview.subtotalCents)}</td></tr>
              <tr><td colSpan={2} /><td className="py-0.5 px-2 text-right text-ink-soft">GST</td><td className="border-l border-line py-0.5 px-2 text-right text-ink-soft">{formatAUD(preview.gstCents)}</td></tr>
              <tr className="border-t-2 border-line"><td colSpan={2} /><td className={`${CELL} text-right font-medium text-ink`}>Total</td><td className={`${NUM_CELL} font-medium text-ink`}>{formatAUD(preview.totalCents)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={issue} className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
          Issue invoice
        </button>
        {issued && (
          <>
            <span className="text-sm" style={{ color: "var(--color-umber)" }}>Invoice issued — {formatAUD(issued.totalCents)}.</span>
            <InvoiceActions invoice={issued} />
          </>
        )}
      </div>
    </div>
  );
}
