"use client";

// Hand a generated file to the user's own mail (or other) app. Two paths, best-first:
//
//   1. Web Share API with files — the native share sheet, which attaches the REAL file when the
//      user picks Mail. Supported on iOS/iPadOS Safari and most Android browsers, and gated by
//      `navigator.canShare({ files })` so we never call it where files aren't accepted.
//   2. Fallback — download the file, then open a prefilled `mailto:` compose. `mailto:` cannot
//      carry an attachment, so the just-downloaded file is attached by hand; the body carries a
//      note saying so. This is how most desktop browsers land.
//
// This mirrors the "Send a consent to sign" hand-off (which is pure mailto, no file) while
// actually attaching the invoice PDF wherever the platform allows it.
import { mailtoHref } from "@/lib/demo/remoteSigning";

export type HandoffResult = "shared" | "mailto" | "cancelled";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revocation: revoking synchronously can abort the download (directionPdf precedent).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareOrMailFile(opts: {
  bytes: Uint8Array;
  filename: string;
  type?: string;
  email?: string;
  subject: string;
  body: string;
  /** Appended to the body ONLY on the mailto fallback (the file rode along on the share path). */
  attachNote?: string;
}): Promise<HandoffResult> {
  const type = opts.type ?? "application/octet-stream";
  const blob = new Blob([opts.bytes as BlobPart], { type });
  const file = new File([blob], opts.filename, { type });

  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (typeof nav?.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: opts.subject, text: opts.body });
      return "shared";
    } catch (e) {
      // Dismissing the share sheet is not a failure and must NOT drop through to a second
      // compose window — treat it as a completed no-op.
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Any other share failure falls through to the mailto path below.
    }
  }

  downloadBlob(blob, opts.filename);
  const body = opts.attachNote ? `${opts.body}\n\n${opts.attachNote}` : opts.body;
  window.location.href = mailtoHref(opts.email ?? "", opts.subject, body);
  return "mailto";
}
