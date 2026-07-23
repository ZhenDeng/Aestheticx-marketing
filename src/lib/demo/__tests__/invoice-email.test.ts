import { describe, it, expect } from "vitest";
import { invoiceEmail, INVOICE_ATTACH_NOTE } from "@/lib/demo/invoiceEmail";

// The prefilled invoice email (22/07 feedback) mirrors consentEmail: a greeting, the invoice
// identity, and the amount — short enough to survive a mailto: URL.

describe("invoiceEmail", () => {
  it("addresses the named recipient and states the invoice number, period and total", () => {
    const { subject, body } = invoiceEmail({
      recipientName: "Lumière Clinic", invoiceNumber: "INV-ABC12345", periodLabel: "July 2026", totalText: "$5,500.00",
    });
    expect(subject).toBe("Tax invoice INV-ABC12345 · July 2026");
    expect(body).toContain("Hi Lumière Clinic,");
    expect(body).toContain("INV-ABC12345");
    expect(body).toContain("July 2026");
    expect(body).toContain("$5,500.00");
  });

  it("falls back to a plain greeting when no recipient name is known", () => {
    expect(invoiceEmail({ invoiceNumber: "INV-1", periodLabel: "July 2026", totalText: "$1.00" }).body)
      .toMatch(/^Hi,/);
  });

  it("keeps the attach note separate — it is only for the mailto fallback", () => {
    // The note must NOT be baked into the base body (the share path attaches the real file).
    expect(invoiceEmail({ invoiceNumber: "INV-1", periodLabel: "July 2026", totalText: "$1.00" }).body)
      .not.toContain(INVOICE_ATTACH_NOTE);
  });
});
