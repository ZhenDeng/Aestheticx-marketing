"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { heldIdentities } from "@/lib/demo/identity";
import { formatAUD } from "@/lib/demo/invoicing";
import type { ServiceInvoiceLineInput } from "@/lib/demo/backend";

// Manual "Invoice the clinic" composer (spec: manual-service-invoicing, 20/07 feedback):
// an employed practitioner (nurse, or doctor with an employee-kind clinic relationship)
// hand-writes service lines and issues a FINAL service-fee invoice to their clinic; both
// business identities are stamped by the backend, never typed. Renders nothing for
// ineligible viewers, and — like every matrix surface — stays hidden in live mode until
// the backend callable ships.
interface DraftLine { description: string; amount: string; }

const EMPTY_LINE: DraftLine = { description: "", amount: "" };

// "1000" / "1,000.50" → integer cents, or null when unparseable/non-positive.
function centsOf(amount: string): number | null {
  const dollars = Number(amount.replace(/,/g, "").trim());
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export function ServiceInvoiceComposer() {
  const { identity, availableIdentities } = useDemoAuth();
  const store = useDemoStore();
  const [lines, setLines] = useState<DraftLine[]>([EMPTY_LINE]);
  const [clinicChoice, setClinicChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState(false);

  if (!identity || !store.matrixEnabled) return null;
  if (identity.role !== "nurse" && identity.role !== "doctor") return null;

  // The clinics this account belongs to, whichever identity is active — a nurse
  // practising independently today is still the clinic's employee. Doctors gain clinic
  // identities from employee-kind relationships (heldIdentities mirrors the claims grant).
  const clinicOptions: { id: string; name: string }[] = [];
  for (const held of heldIdentities(identity, availableIdentities, store.cooperationRelationships())) {
    if (held.context.kind !== "clinic") continue;
    const clinic = held.context.clinic;
    if (!clinicOptions.some((c) => c.id === clinic.id)) {
      clinicOptions.push({ id: clinic.id, name: clinic.name });
    }
  }
  if (clinicOptions.length === 0) return null;

  const clinicID = clinicOptions.some((c) => c.id === clinicChoice) ? clinicChoice : clinicOptions[0].id;
  const clinicName = clinicOptions.find((c) => c.id === clinicID)!.name;

  // Live preview over the currently-parseable lines: GST-exclusive, 10% on top per line.
  const parsed = lines.map((l) => ({ description: l.description.trim(), cents: centsOf(l.amount) }));
  const previewable = parsed.filter((l) => l.cents !== null) as { description: string; cents: number }[];
  const subtotalCents = previewable.reduce((sum, l) => sum + l.cents, 0);
  const gstCents = previewable.reduce((sum, l) => sum + Math.round(l.cents * 0.1), 0);

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setIssued(false);
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function issue() {
    setError(null);
    setIssued(false);
    const inputs: ServiceInvoiceLineInput[] = [];
    for (let i = 0; i < parsed.length; i++) {
      if (!parsed[i].description || parsed[i].cents === null) {
        setError(`Complete line ${i + 1} — a description and a positive amount.`);
        return;
      }
      inputs.push({ description: parsed[i].description, amountCents: parsed[i].cents! });
    }
    try {
      store.createServiceInvoice({ clinicID, lines: inputs }, identity!);
      setLines([EMPTY_LINE]);
      setIssued(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue the invoice");
    }
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-ink">Invoice the clinic</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Bill your clinic for services — write each line yourself; both businesses&apos;
        details are added to the invoice automatically.
      </p>
      <div className="mt-3 rounded-card border border-line bg-card p-5 shadow-card">
        {clinicOptions.length > 1 ? (
          <label className="block max-w-xs">
            <span className="micro">Clinic</span>
            <select
              value={clinicID}
              onChange={(e) => setClinicChoice(e.target.value)}
              className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink"
            >
              {clinicOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : (
          <p className="text-sm text-ink"><span className="micro mr-2">Billed to</span>{clinicName}</p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-field border border-line p-2.5 sm:grid-cols-[2fr_1fr_auto]">
              <input
                value={line.description}
                placeholder="Description of services"
                aria-label={`Line ${i + 1} description`}
                onChange={(e) => patchLine(i, { description: e.target.value })}
                className="rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint"
              />
              <input
                value={line.amount}
                placeholder="Amount ex GST"
                inputMode="decimal"
                aria-label={`Line ${i + 1} amount`}
                onChange={(e) => patchLine(i, { amount: e.target.value })}
                className="rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint"
              />
              <button
                type="button"
                onClick={() => setLines((rows) => rows.filter((_, j) => j !== i))}
                disabled={lines.length <= 1}
                className="text-sm text-ink-soft hover:text-ink disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLines((rows) => [...rows, EMPTY_LINE])}
          className="mt-2 rounded-btn border border-line px-3 py-1 text-sm text-ink-soft hover:border-tint/50"
        >
          Add line
        </button>
        {previewable.length > 0 && (
          <div className="mt-3 flex flex-col items-end gap-0.5 text-sm">
            <p className="text-ink-soft">Subtotal <span className="ml-2 inline-block w-24 text-right">{formatAUD(subtotalCents)}</span></p>
            <p className="text-ink-soft">GST (10%) <span className="ml-2 inline-block w-24 text-right">{formatAUD(gstCents)}</span></p>
            <p className="font-medium text-ink">Total <span className="ml-2 inline-block w-24 text-right">{formatAUD(subtotalCents + gstCents)}</span></p>
          </div>
        )}
        {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
        {issued && <p className="mt-2 text-sm" style={{ color: "var(--color-umber)" }}>Service invoice issued — it appears under Service fees below.</p>}
        <div className="mt-3">
          <button
            type="button"
            onClick={issue}
            className="rounded-btn px-4 py-2 text-sm font-medium text-card"
            style={{ background: "var(--color-tint)" }}
          >
            Issue invoice
          </button>
        </div>
      </div>
    </section>
  );
}
