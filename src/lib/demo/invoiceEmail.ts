// Prefilled subject + body for the invoice mail-app hand-off (22/07 feedback: generating an
// invoice should open the practitioner's own mail app with the text and PDF ready, mirroring
// the "Send a consent to sign" email). Pure — no DOM/Firebase, so it stays unit-testable.

export function invoiceEmail(opts: {
  recipientName?: string;
  invoiceNumber: string;
  periodLabel: string;
  totalText: string;
}): { subject: string; body: string } {
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : "Hi,";
  const subject = `Tax invoice ${opts.invoiceNumber} · ${opts.periodLabel}`;
  const body = [
    greeting,
    "",
    `Please find attached your AestheticX tax invoice ${opts.invoiceNumber} for ${opts.periodLabel}.`,
    `Total amount payable: ${opts.totalText}.`,
    "",
    "Kind regards,",
  ].join("\n");
  return { subject, body };
}

// Appended to the body only on the mailto fallback, where the file cannot ride along the
// mailto: link and has instead been downloaded for the practitioner to attach.
export const INVOICE_ATTACH_NOTE =
  "The invoice PDF has just been downloaded to your device — please attach it to this email before sending.";
