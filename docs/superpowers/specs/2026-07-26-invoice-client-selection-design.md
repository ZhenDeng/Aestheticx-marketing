# Invoice client — visibility + selection (2026-07-26)

## Problem

The "Invoice client" composer never shows who it bills — the client is implied by the
page it's mounted on (patient file, calendar check-out). Issued manual client invoices
are listed only on that client's file, without a name, and never appear on the Invoice
page: the `MatrixStreams` "Client invoices" stream filters `client-sale`/`top-up` only.
There is also no way to pick a client and invoice from the Invoice page — the nurse-only
"Invoice a client" list just links to each file.

## Design

### 1. Composer shows who it bills

`ClientInvoiceComposer` gains a caption at the top of the card — "Billing to
**{client name}**" — and the post-issue confirmation becomes "Invoice issued to
{name} — $X". Applies everywhere the composer mounts.

### 2. Issued client invoices on the Invoice page, named

`MatrixStreams.clientDocs` includes kind `client-invoice` alongside
`client-sale`/`top-up`, with a "Client invoice" `KIND_LABEL` chip. Rows already render
`billTo.businessName`, which `clientBillTo` sets to the client's full name, so each row
reads "{date} · {client name} · {total}" with Mark paid + PDF/email actions.
Demo-mode only, as today (`matrixEnabled`) — live does not persist client invoices;
that remains a backend follow-up, unchanged.

### 3. Select a client on the Invoice page

The "Invoice a client" section (was nurse-only, demo-only, link-only) becomes:

- available to all clinical roles (doctor, nurse, clinic admin) — lists every client
  the active identity can access, same `patientAccess` gate as today;
- each client row keeps the link to the file and gains an **Invoice** button that
  expands `ClientInvoiceComposer` inline for that client;
- enabled in live mode too: the manual composer already works live from the patient
  file (PDF hand-off, nothing persisted), so the same applies here. The old live-mode
  explainer paragraph is replaced by a short note that live invoices aren't stored yet.

## Testing

TDD-first: extend `client-invoice-composer.test.tsx` (caption + named confirmation);
billing-page tests for the stream inclusion and the inline selector expansion.

## Out of scope

Live persistence of client invoices, payments, service-fee/authorisation streams.
