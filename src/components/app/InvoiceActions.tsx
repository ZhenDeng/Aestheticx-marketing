"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { invoicePartiesFor } from "@/lib/demo/backend";
import { formatAUD, type Invoice } from "@/lib/demo/invoicing";
import { buildTaxInvoiceModel, invoiceNumber, renderTaxInvoicePdf, taxInvoicePdfFilename } from "@/lib/demo/invoicePdf";
import { invoiceEmail, INVOICE_ATTACH_NOTE } from "@/lib/demo/invoiceEmail";
import { shareOrMailFile } from "@/lib/shareFile";

// 14/07 feedback: the exported PDF follows the ATO's Example 2 tax-invoice layout and is
// rendered CLIENT-side from the invoice in state — identical in demo and live, no server
// round-trip. (The backend still archives its own PDF copy in Storage for live audit.)
// Shared by the billing page and the client-invoice composer.
export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const store = useDemoStore();
  const [error, setError] = useState(false);
  const [emailing, setEmailing] = useState(false);

  // Render the client-side ATO PDF once for whichever action is taken.
  function renderPdf(): Uint8Array {
    const { issuer, billTo } = invoicePartiesFor(store.state, invoice);
    return renderTaxInvoicePdf(buildTaxInvoiceModel(invoice, issuer, billTo));
  }

  function download() {
    setError(false);
    try {
      const bytes = renderPdf();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = taxInvoicePdfFilename(invoice.id);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revocation: revoking synchronously can abort the download (directionPdf precedent).
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(true);
    }
  }

  // 22/07 feedback: hand the invoice to the practitioner's own mail app, prefilled and (where
  // the platform supports it) with the PDF attached — replacing the server's silent auto-send.
  async function email() {
    setError(false);
    setEmailing(true);
    try {
      const { billTo } = invoicePartiesFor(store.state, invoice);
      const { subject, body } = invoiceEmail({
        recipientName: billTo.name || billTo.businessName || undefined,
        invoiceNumber: invoiceNumber(invoice.id),
        periodLabel: invoice.periodLabel,
        totalText: formatAUD(invoice.totalCents),
      });
      await shareOrMailFile({
        bytes: renderPdf(),
        filename: taxInvoicePdfFilename(invoice.id),
        type: "application/pdf",
        email: billTo.email || undefined,
        subject,
        body,
        attachNote: INVOICE_ATTACH_NOTE,
      });
    } catch {
      setError(true);
    } finally {
      setEmailing(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs" style={{ color: "var(--color-rose)" }}>Couldn’t create the PDF</span>}
      <button type="button" onClick={() => void email()} disabled={emailing}
        className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint disabled:opacity-50">
        {emailing ? "Opening…" : "Email invoice"}
      </button>
      <button type="button" onClick={download}
        className="rounded-btn border border-line px-3 py-1 text-xs text-ink-soft hover:border-tint">
        Download PDF
      </button>
    </span>
  );
}
