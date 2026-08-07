"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { monthLabel, monthKey, type BillingParty } from "@/lib/demo/billing";
import { counterpartyMonthDetail, ownerDisplayLabel, isoDay } from "@/lib/demo/backend";
import { canDeleteInvoice, formatAUD, computeInvoice, resolveInvoiceKind, scriptsFromBillable, authIDsForSelectedScripts, GST_RATE, DEFAULT_SCRIPT_PRICE_CENTS, type Invoice } from "@/lib/demo/invoicing";
import { invoiceNumber } from "@/lib/demo/invoicePdf";
import { monthlyStatement, statementCsv, statementCsvFilename, statementEmailBody, statementEmailSubject } from "@/lib/demo/invoiceStatement";
import { mailtoHref } from "@/lib/demo/remoteSigning";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { ServiceInvoiceComposer } from "@/components/app/ServiceInvoiceComposer";
import { InvoiceActions } from "@/components/app/InvoiceActions";

export default function BillingPage() {
  const { identity, employeeOnly } = useDemoAuth();
  const store = useDemoStore();
  const [openPanel, setOpenPanel] = useState<string | null>(null); // `${monthKey}:${counterpartyID}`
  const [priceInput, setPriceInput] = useState<string>("");
  const [marking, setMarking] = useState<string | null>(null); // invoice id being marked paid (in flight)

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const me = identity;
  const isDoctor = me.role === "doctor";
  // Billing matrix: the page opens to every clinical role — each sees only its own
  // streams. Platform admin keeps the admin shell (no billing surface).
  if (me.role === "superAdmin") {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl text-ink">Invoice</h1>
        <p className="mt-2 text-ink-soft">Billing lives with the clinical roles; the admin shell has no invoice stream.</p>
      </div>
    );
  }
  // Clinic-employee-only nurse (02/08): no ABN, no billing capability — invoicing for the
  // clinic's clients belongs to the clinic admin. The nav hides the tab; this covers deep links.
  if (employeeOnly) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl text-ink">Invoice</h1>
        <p className="mt-2 text-ink-soft">Invoicing for the clinic is handled by your clinic admin — this account has no billing stream.</p>
      </div>
    );
  }
  const summary = store.billingSummary(me);
  // The classic list below is the AUTHORISATION stream only — matrix documents render
  // in their own kind-tagged sections (MatrixStreams), never mixed into it.
  const invoices = store.invoicesFor(me).filter((i) => resolveInvoiceKind(i) === "authorisation");
  const heading = isDoctor ? "Authorisation requests you've approved" : "Approvals billed to you";
  const partyNoun = isDoctor ? "Counterparty" : "Prescribing doctor";

  function openGenerate(monthKey: string, counterpartyID: string) {
    setOpenPanel(`${monthKey}:${counterpartyID}`);
    setPriceInput((store.scriptPrice(me.user.id, counterpartyID) / 100).toFixed(2));
  }

  // 14/07 feedback: the Invoice section leads with THIS calendar month per counterparty,
  // each row expandable into the date–patient–detail drilldown + price editing + generate.
  const currentMonthKey = monthKey(store.now);
  const thisMonth = summary.months.find((m) => m.monthKey === currentMonthKey);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink">Invoice</h1>
      {isDoctor && <p className="mt-1 text-ink-soft">{heading}</p>}

      {isDoctor && (
        <div className="mt-5 rounded-card border border-line bg-card p-5 shadow-card">
          <span className="micro">Total approved requests</span>
          <p className="mt-1 font-display text-4xl text-ink">{summary.totalCount}</p>
        </div>
      )}

      {isDoctor && (
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl text-ink">This month</h2>
            <span className="micro">{monthLabel(currentMonthKey)}</span>
          </div>
          {!thisMonth ? (
            <p className="mt-2 text-sm text-ink-soft">No authorisations approved yet this month.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {thisMonth.byParty.map((p) => (
                <ThisMonthRow key={`${p.type}:${p.id}`} party={p} monthKey={currentMonthKey} />
              ))}
            </ul>
          )}
        </section>
      )}

      {!isDoctor ? null : summary.months.length === 0 ? (
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
                        <span className="text-sm text-ink"><span className="micro mr-2">{partyNoun}</span>{ownerDisplayLabel(store.state, { kind: p.type, id: p.id })}</span>
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

      {/* Owner feedback 07/08: the Invoice tab shows issued client invoices only (the
          Client invoices stream below) — issuing one lives on the client's file, where
          the composer and checkout already are. The old full-book picker is gone. */}
      <ServiceInvoiceComposer />

      {/* Billing matrix streams: client invoices, service fees (drafts to finalize),
          received service fees — kind-tagged, per role (design-ui.md §4). */}
      <MatrixStreams />

      {/* 02/08 feedback: month-end summary of everything issued — per-type list + totals,
          exportable as CSV or handed to the mail app. */}
      <MonthlyStatementSection />

      {isDoctor && <CustomTimeframeCard />}
      <ClinicStatsSection />

      {!isDoctor ? null : (
      <>
      <h2 className="mt-10 font-display text-xl text-ink">Invoices</h2>
      {invoices.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No invoices yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {invoices.map((inv) => {
            // Tier 3 #4: the other party's identity as snapshotted on the invoice at generation —
            // the bill-to counterparty for a doctor, the issuing doctor for a nurse/clinic. Legacy
            // invoices carry no snapshot (undefined) and simply show no ABN caption.
            const party = isDoctor ? inv.billTo : inv.issuer;
            return (
            <li key={inv.id} className="flex items-center justify-between rounded-inner border border-line bg-card px-4 py-3">
              <span className="text-sm text-ink">
                {inv.periodLabel} · {ownerDisplayLabel(store.state, isDoctor && inv.counterpartyType !== "client" ? { kind: inv.counterpartyType, id: inv.counterpartyID } : { kind: "doctor", id: inv.doctorID })}
                <span className="ml-2 font-medium">{formatAUD(inv.totalCents)}</span>
                <span className="ml-2 rounded-btn px-2 py-0.5 text-xs" style={inv.paid
                  ? { background: "var(--color-tint)", color: "var(--color-card)" }
                  : { border: "1px solid var(--color-line)", color: "var(--color-ink-soft)" }}>
                  {inv.paid ? "Paid" : "Unpaid"}
                </span>
                {party?.abn && (
                  <span className="mt-0.5 block text-xs text-ink-soft">{party.businessName} · ABN {party.abn}</span>
                )}
                {/* 22/07 feedback: the invoice is no longer auto-emailed by the server. The
                    "Email invoice" action hands the PDF to the practitioner's own mail app —
                    so surface the recipient on file, not a claim that anything was sent. */}
                {isDoctor && (
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {inv.billTo?.email
                      ? `Email invoice — opens your mail app to ${inv.billTo.email}`
                      : "No billing email on file — you'll choose the recipient in your mail app."}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap items-center justify-end gap-3">
                {isDoctor && !inv.paid && (
                  <button type="button" disabled={marking === inv.id}
                    onClick={() => { setMarking(inv.id); store.markInvoicePaid(inv.id, me); }}
                    className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint disabled:opacity-50">
                    {marking === inv.id ? "Marking…" : "Mark paid"}
                  </button>
                )}
                <InvoiceActions invoice={inv} />
                {/* 16/07 feedback enhancement 2: delete to correct an error — its authorisations
                    return to the un-invoiced pool so a corrected invoice can be regenerated. */}
                {isDoctor && (
                  <ConfirmAction
                    label="Delete"
                    prompt="Delete this invoice? Its authorisations return to un-invoiced."
                    confirmLabel="Delete invoice"
                    onConfirm={() => store.deleteInvoice(inv.id, me)}
                    triggerClassName="text-xs"
                  />
                )}
              </span>
            </li>
            );
          })}
        </ul>
      )}
      </>
      )}
    </div>
  );
}

// ——— Billing matrix streams (change: multi-tenant-billing-matrix, design-ui.md §4) ———

const KIND_LABEL: Record<string, string> = { "client-sale": "Client sale", "top-up": "Top-up", "service-fee": "Service fee", "client-invoice": "Client invoice" };

function KindChip({ kind }: { kind: string }) {
  return <span className="micro rounded-full border border-line px-2 py-0.5 text-ink-soft">{KIND_LABEL[kind] ?? kind}</span>;
}

function PaidChip({ paid }: { paid: boolean }) {
  return (
    <span className="rounded-btn px-2 py-0.5 text-xs" style={paid
      ? { background: "var(--color-tint)", color: "var(--color-card)" }
      : { border: "1px solid var(--color-line)", color: "var(--color-ink-soft)" }}>
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}

function MatrixInvoiceRow({ invoice, action }: { invoice: Invoice; action?: React.ReactNode }) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  // Client docs read best under the CLIENT's name (the bill-to snapshot); B2B service
  // fees under the other business's name from this viewer's side.
  const kind = resolveInvoiceKind(invoice);
  return (
    <li className="flex items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-3">
      <span className="min-w-0 text-sm text-ink">
        {invoice.periodLabel} · {invoice.billTo?.businessName || "—"}
        <span className="ml-2 font-medium">{formatAUD(invoice.totalCents)}</span>
        <span className="ml-2 inline-flex items-center gap-1.5">
          <KindChip kind={kind} />
          {invoice.draft ? (
            <span className="micro rounded-full px-2 py-0.5" style={{ border: "1px solid var(--color-gold)", color: "var(--color-gold-deep)" }}>Draft</span>
          ) : (
            <PaidChip paid={invoice.paid} />
          )}
        </span>
      </span>
      <span className="flex flex-none flex-wrap items-center justify-end gap-3">
        {action}
        <InvoiceActions invoice={invoice} />
        {/* 02/08: issued records are correctable — the issuer silo deletes (confirm-to-
            delete); wallet-linked documents never offer it (canDeleteInvoice). */}
        {identity && canDeleteInvoice(invoice, identity) && (
          <ConfirmAction
            label="Delete"
            prompt="Delete this invoice record?"
            confirmLabel="Delete invoice"
            onConfirm={() => store.deleteInvoice(invoice.id, identity)}
            triggerClassName="text-xs"
          />
        )}
      </span>
    </li>
  );
}

/** The role's matrix streams: issued client documents, own service fees (drafts first),
 *  and — for clinic-context viewers — received service fees. Sections hide when empty.
 *  Client documents render in both modes now (02/08: client invoices are stored records;
 *  checkout-born sales/top-ups still only exist in demo), like the service-fee streams
 *  (live since backend PR #115). Deletable records (client invoices, manual service
 *  fees) carry a confirm-to-delete action for the issuer. */
function MatrixStreams() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const me = identity!;
  if (!store.matrixEnabled && !store.serviceInvoicingEnabled) return null;
  const all = store.invoicesFor(me);
  const clientDocs = all.filter((i) => {
    const k = resolveInvoiceKind(i);
    return k === "client-sale" || k === "top-up" || k === "client-invoice";
  });
  const feesIssued = all.filter((i) => resolveInvoiceKind(i) === "service-fee" && i.issuerRef?.id === me.user.id);
  const feesReceived = all.filter((i) => resolveInvoiceKind(i) === "service-fee" && i.issuerRef?.id !== me.user.id);
  const drafts = feesIssued.filter((i) => i.draft);
  const issued = feesIssued.filter((i) => !i.draft);

  return (
    <>
      {clientDocs.length > 0 && (
        <section className="mt-10" data-testid="client-invoices">
          <h2 className="font-display text-xl text-ink">Client invoices</h2>
          {/* Issuing moved to the client's file (07/08) — this stream is records only. */}
          <p className="mt-1 text-sm text-ink-soft">Issue a new invoice from the client&apos;s file — issued records stay here.</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {/* Client documents are only ever visible to their issuer silo (the bill-to
                is a patient), so every viewer of this stream may settle them. */}
            {clientDocs.map((inv) => (
              <MatrixInvoiceRow key={inv.id} invoice={inv} action={
                !inv.paid ? (
                  <button type="button" onClick={() => store.markInvoicePaid(inv.id, me)}
                    className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint">
                    Mark paid
                  </button>
                ) : undefined
              } />
            ))}
          </ul>
        </section>
      )}
      {feesIssued.length > 0 && (
        <section className="mt-10" data-testid="service-fees">
          <h2 className="font-display text-xl text-ink">Service fees</h2>
          {drafts.length > 0 && (
            <>
              <p className="micro mt-3">Awaiting your review</p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {drafts.map((inv) => (
                  <MatrixInvoiceRow key={inv.id} invoice={inv} action={
                    <button type="button" onClick={() => store.finalizeServiceFee(inv.id, me)}
                      className="rounded-btn px-3 py-1 text-xs font-medium text-card" style={{ background: "var(--color-tint)" }}>
                      Finalize &amp; send
                    </button>
                  } />
                ))}
              </ul>
            </>
          )}
          {issued.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {/* The practitioner (issuer) records the clinic's settlement of their fee. */}
              {issued.map((inv) => (
                <MatrixInvoiceRow key={inv.id} invoice={inv} action={
                  !inv.paid ? (
                    <button type="button" onClick={() => store.markInvoicePaid(inv.id, me)}
                      className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint">
                      Mark paid
                    </button>
                  ) : undefined
                } />
              ))}
            </ul>
          )}
        </section>
      )}
      {feesReceived.length > 0 && (
        <section className="mt-10" data-testid="received-service-fees">
          <h2 className="font-display text-xl text-ink">Received service fees</h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {feesReceived.map((inv) => (
              // Received rows read best under the PRACTITIONER's name (the issuer snapshot).
              <li key={inv.id} className="flex items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-3">
                <span className="min-w-0 text-sm text-ink">
                  {inv.periodLabel} · {inv.issuer?.businessName || "—"}
                  <span className="ml-2 font-medium">{formatAUD(inv.totalCents)}</span>
                  <span className="ml-2 inline-flex items-center gap-1.5">
                    <KindChip kind="service-fee" />
                    <PaidChip paid={inv.paid} />
                  </span>
                </span>
                <span className="flex flex-none items-center gap-3">
                  <InvoiceActions invoice={inv} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ——— Monthly summary (02/08 feedback) ———
// "Which invoices went out this month, and how much in total?" — every stored (undeleted)
// invoice the active identity ISSUED in the picked month, grouped per type with per-type
// and overall totals. Deleted records are gone from the store, so the sums are exactly
// the archive. Download hands over a CSV; Email opens the practitioner's own mail app
// with the list in the body (nothing is auto-sent — the aftercare/invoice doctrine).
function MonthlyStatementSection() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const me = identity!;
  const [month, setMonth] = useState(() => monthKey(store.now));
  const statement = monthlyStatement(store.state.invoices, me, month);

  function downloadCsv() {
    const blob = new Blob([statementCsv(statement)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = statementCsvFilename(month);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // A real anchor, not a location mutation: the AftercareForm mailto idiom — the mail
  // client sends it, not us, and the practitioner picks the recipient there.
  const emailHref = mailtoHref("", statementEmailSubject(month), statementEmailBody(statement));
  const mayTruncate = emailHref.length > 2000;

  return (
    <section className="mt-10" data-testid="monthly-summary">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">Monthly summary</h2>
          <p className="mt-1 text-sm text-ink-soft">Every invoice you issued in the month — per type, with totals.</p>
        </div>
        <label className="block">
          <span className="micro">Month</span>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="mt-1 block rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
        </label>
      </div>
      {statement.count === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No invoices issued in {monthLabel(month)}.</p>
      ) : (
        <>
          {statement.groups.map((g) => (
            <div key={g.kind} className="mt-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-medium text-ink">{g.label}</h3>
                <span className="text-sm text-ink">{g.invoices.length} · <span className="font-medium">{formatAUD(g.totalCents)}</span></span>
              </div>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {g.invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-2.5">
                    <span className="min-w-0 text-sm text-ink">
                      {invoiceNumber(inv.id)} · {inv.periodLabel} · {inv.billTo?.businessName || "—"}
                      <span className="ml-2 font-medium">{formatAUD(inv.totalCents)}</span>
                      <span className="ml-2 inline-flex"><PaidChip paid={inv.paid} /></span>
                    </span>
                    <span className="flex flex-none items-center gap-3">
                      <InvoiceActions invoice={inv} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-inner border border-line bg-card px-4 py-3">
            <span className="text-sm text-ink">
              Total — {statement.count} invoice{statement.count === 1 ? "" : "s"}
              <span className="ml-2 font-display text-lg">{formatAUD(statement.totalCents)}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={downloadCsv}
                className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint">
                Download CSV
              </button>
              <a href={emailHref}
                className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint">
                Email summary
              </a>
            </span>
          </div>
          {mayTruncate && (
            <p className="mt-2 text-xs text-ink-soft">
              Long summary — some mail apps truncate it. The CSV download always carries the full list.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// One current-month counterparty row of the Invoice section (14/07 feedback): click the
// nurse/clinic name to open the drilldown — every approved request of the month as
// "date — patient — items", most recent first — plus the per-counterparty price editor
// and invoice generation (GeneratePanel, shared with the historical grid).
function ThisMonthRow({ party, monthKey: mk }: { party: BillingParty; monthKey: string }) {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const me = identity!;
  const [open, setOpen] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const counterpartyType = party.type === "clinic" ? "clinic" : "nurse";
  const rows = open ? counterpartyMonthDetail(store.state, me.user.id, counterpartyType, party.id, mk) : [];

  function toggle() {
    if (!open) setPriceInput((store.scriptPrice(me.user.id, party.id) / 100).toFixed(2));
    setOpen((o) => !o);
  }

  return (
    <li className="rounded-inner border border-line bg-card px-4 py-3">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium text-ink">{ownerDisplayLabel(store.state, { kind: party.type, id: party.id })}</span>
        <span className="flex items-center gap-2 text-sm text-ink">
          {party.count} authorisation{party.count === 1 ? "" : "s"}
          <span aria-hidden className="text-ink-soft">{open ? "▾" : "›"}</span>
        </span>
      </button>
      {open && (
        <div className="mt-3">
          <ul className="flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.requestID} className="flex items-start justify-between gap-3 border-b border-line py-1.5 text-sm last:border-b-0">
                <span className="min-w-0">
                  <span className="text-ink">{r.dateISO} — {r.patientName}</span>
                  <span className="block text-xs text-ink-soft">{r.detail}</span>
                </span>
                {r.invoiced && <span className="micro flex-none rounded-full border border-line px-2 py-0.5 text-ink-soft">Invoiced</span>}
              </li>
            ))}
          </ul>
          <GeneratePanel
            monthKey={mk}
            counterpartyID={party.id}
            counterpartyType={counterpartyType}
            priceInput={priceInput}
            setPriceInput={setPriceInput}
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </li>
  );
}

// UTC day-string → inclusive range bounds, matching the ledger's inclusive [from, to].
function dayStartUTC(iso: string): number { return Date.parse(`${iso}T00:00:00.000Z`); }
function dayEndUTC(iso: string): number { return Date.parse(`${iso}T23:59:59.999Z`); }
function monthsBefore(millis: number, months: number): number {
  const d = new Date(millis);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate());
}

// Ad-hoc timeframe count for any billing identity (port of BillingView's
// "Custom timeframe" card: from/to pickers + Compute; iOS defaults to 3 months back).
function CustomTimeframeCard() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const me = identity!;
  const [from, setFrom] = useState(() => isoDay(monthsBefore(store.now, 3)));
  const [to, setTo] = useState(() => isoDay(store.now));
  const [count, setCount] = useState<number | null>(null);

  function compute() {
    const fromMillis = dayStartUTC(from);
    const toMillis = dayEndUTC(to);
    if (Number.isNaN(fromMillis) || Number.isNaN(toMillis)) return;
    setCount(store.customTimeframeCount(me, fromMillis, toMillis));
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-ink">Custom timeframe</h2>
      <div className="mt-3 rounded-card border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="micro">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
          </label>
          <label className="block">
            <span className="micro">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
          </label>
          <button type="button" onClick={compute}
            className="rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            Compute
          </button>
        </div>
        {count !== null && (
          <p className="mt-3 text-sm text-ink"><span className="font-medium">{count}</span> authorisation{count === 1 ? "" : "s"} in range</p>
        )}
      </div>
    </section>
  );
}

// Clinic-admin business statistics (port of ClinicStatsView): recomputes live as the
// range changes; hidden from everyone else — the domain fn returns null for them.
function ClinicStatsSection() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const me = identity!;
  const [from, setFrom] = useState(() => isoDay(monthsBefore(store.now, 1)));
  const [to, setTo] = useState(() => isoDay(store.now));
  const fromMillis = dayStartUTC(from);
  const toMillis = dayEndUTC(to);
  const rangeValid = !Number.isNaN(fromMillis) && !Number.isNaN(toMillis);
  const stats = store.clinicBusinessStats(me, rangeValid ? fromMillis : 0, rangeValid ? toMillis : 0);
  if (!stats) return null;

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-ink">Clinic statistics</h2>
      <div className="mt-3 rounded-card border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="micro">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
          </label>
          <label className="block">
            <span className="micro">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatTile value={stats.authorisationsApproved} label="Authorisations" />
          <StatTile value={stats.patientsServed} label="Patients served" />
          <StatTile value={stats.repeatsUsed} label="Repeats used" />
        </div>
        <p className="mt-3 text-sm text-ink-soft">Service is measured by actual authorisation and repeat usage.</p>
      </div>
    </section>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-inner border border-line bg-card px-4 py-4 text-center">
      <p className="font-display text-3xl text-ink">{value}</p>
      <p className="micro mt-1">{label}</p>
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
  // 15/07 feedback: count + price per authorisation (script), not per medication item — a
  // multi-item request is one script. Regroup the request's items before pricing/previewing.
  const scripts = scriptsFromBillable(rows);
  // 16/07 feedback enhancement 2: the doctor selects WHICH scripts to bill (default all) so a
  // free script can be excluded. Selection is by requestID; generation expands the ticked
  // scripts back to their member item-authorisation ids.
  // Track the scripts the doctor has EXPLICITLY unticked (by requestID), not the selected
  // set — so the effective selection is purely derived from the live scripts each render:
  // a newly-appeared script defaults to selected (it's not in `unticked`), a removed one
  // just drops out, and an untick survives a live re-hydrate that reorders or replaces
  // `state.authorisations`. No reconcile effect, no order sensitivity, no mis-bill.
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());
  const selectedScripts = scripts.filter((s) => !unticked.has(s.requestID));
  const selectedRequestIDs = new Set(selectedScripts.map((s) => s.requestID));
  const storedPrice = store.scriptPrice(me.user.id, counterpartyID);
  const previewPrice = Math.round((parseFloat(priceInput) || 0) * 100) || storedPrice || DEFAULT_SCRIPT_PRICE_CENTS;
  const preview = selectedScripts.length > 0
    ? computeInvoice({ pricePerScriptCents: previewPrice, gstRate: GST_RATE, authorisations: selectedScripts.map((sc) => ({ id: sc.requestID, dateISO: sc.dateISO, patientName: sc.patientName })) })
    : null;

  function toggle(requestID: string) {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(requestID)) next.delete(requestID); else next.add(requestID);
      return next;
    });
  }
  function savePrice() {
    const cents = Math.round((parseFloat(priceInput) || 0) * 100);
    if (cents > 0) store.setScriptPrice(counterpartyID, cents, me);
  }
  function generate() {
    if (selectedScripts.length === 0) return;
    // Pass the member item-authorisation ids of ONLY the ticked scripts; the backend
    // regroups them into one line per script and flags every member invoiced.
    store.generateInvoice({ doctorID: me.user.id, counterpartyID, counterpartyType, periodLabel: monthLabel(monthKey), authIDs: authIDsForSelectedScripts(scripts, selectedRequestIDs) }, me);
    onDone();
  }

  return (
    <div className="mt-3 rounded-inner border border-line p-3">
      <div className="flex items-baseline justify-between">
        <p className="micro">{selectedScripts.length} of {scripts.length} selected</p>
        {scripts.length > 0 && (
          <span className="flex gap-2 text-xs">
            <button type="button" onClick={() => setUnticked(new Set())} className="text-ink-soft hover:text-ink">Select all</button>
            <span aria-hidden className="text-ink-soft">·</span>
            <button type="button" onClick={() => setUnticked(new Set(scripts.map((s) => s.requestID)))} className="text-ink-soft hover:text-ink">Select none</button>
          </span>
        )}
      </div>
      {scripts.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">Nothing left to invoice for this counterparty.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {scripts.map((sc) => (
            <li key={sc.requestID}>
              <label className="flex cursor-pointer items-center gap-3 rounded-inner px-1 py-1.5 text-sm hover:bg-[var(--color-tint-soft)]/40">
                <input
                  type="checkbox"
                  checked={!unticked.has(sc.requestID)}
                  onChange={() => toggle(sc.requestID)}
                  aria-label={`${sc.patientName} — ${invoiceLineDay(sc.dateISO)}`}
                  style={{ accentColor: "var(--color-tint)" }}
                />
                <span className="min-w-0">
                  <span className="text-ink">{invoiceLineDay(sc.dateISO)} — {sc.patientName}</span>
                  {sc.authIDs.length > 1 && <span className="ml-2 text-xs text-ink-soft">{sc.authIDs.length} items · one script</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-end gap-2">
        <label className="block">
          <span className="micro">Price per script (AUD)</span>
          <input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} inputMode="decimal"
            className="mt-1 w-28 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
        </label>
        <button type="button" onClick={savePrice} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Save price</button>
      </div>
      {/* 16/07 enhancement 3 + 17/07 feedback: an on-screen preview that mirrors the PDF's
          bordered grid — outer frame, column dividers, right-aligned totals with a bold
          Total row — so what the doctor sees matches paper. */}
      {preview ? (
        // The frame lives on the scroll wrapper: border-radius can't render on a
        // border-collapse table, and the rounded-inner corner matches the panel.
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
                  <td className={`${CELL} text-ink`}>{invoiceLineDay(l.dateISO)} — {l.patientName}</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>1</td>
                  <td className={`${NUM_CELL} text-ink-soft`}>{formatAUD(l.feeCents)}</td>
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
        <p className="mt-2 text-sm text-ink-soft">Select at least one authorisation to invoice.</p>
      )}
      <div className="mt-3">
        <button type="button" onClick={generate} disabled={selectedScripts.length === 0}
          className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          Generate invoice
        </button>
      </div>
    </div>
  );
}

// Shared preview-grid cell classes: every non-first column carries a left divider (the
// PDF's column frames), numerals right-aligned.
const CELL = "py-1.5 px-2";
const NUM_CELL = "border-l border-line py-1.5 px-2 text-right";

// "10/7/2026" from an ISO day for the selection row (mirrors invoiceLineDate in invoicePdf).
function invoiceLineDay(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  return m ? `${Number(m[3])}/${Number(m[2])}/${Number(m[1])}` : dateISO;
}
