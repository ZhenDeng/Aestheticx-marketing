import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shareOrMailFile } from "@/lib/shareFile";

// The invoice mail-app hand-off (22/07 feedback). Two paths matter: the Web Share path attaches
// the real file where the platform supports it, and the fallback downloads the file and opens a
// prefilled mailto (mailto: cannot carry an attachment). A dismissed share sheet must NOT fall
// through to a second compose window.

const BYTES = new Uint8Array([1, 2, 3]);
const base = { bytes: BYTES, filename: "invoice.pdf", type: "application/pdf", email: "clinic@x.test", subject: "Tax invoice", body: "Hi," };

let hrefSetTo: string | null;
let clickSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  hrefSetTo = null;
  clickSpy = vi.fn();
  // Capture the mailto navigation without leaving jsdom.
  Object.defineProperty(window, "location", { value: { set href(v: string) { hrefSetTo = v; }, get href() { return hrefSetTo ?? ""; } }, writable: true, configurable: true });
  // Neutralise the anchor download so it doesn't actually try to fetch a blob URL.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
});

describe("shareOrMailFile", () => {
  it("uses the Web Share sheet with the file when the platform accepts it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as { share?: unknown }).share = share;
    (navigator as { canShare?: unknown }).canShare = (d: { files?: File[] }) => Array.isArray(d.files) && d.files.length > 0;

    const result = await shareOrMailFile(base);

    expect(result).toBe("shared");
    const arg = share.mock.calls[0][0] as { files: File[]; title: string; text: string };
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0].name).toBe("invoice.pdf");
    expect(arg.title).toBe("Tax invoice");
    expect(clickSpy).not.toHaveBeenCalled(); // no download when the share path is taken
    expect(hrefSetTo).toBeNull();            // and no mailto
  });

  it("falls back to download + mailto when Web Share is unavailable", async () => {
    const result = await shareOrMailFile({ ...base, attachNote: "Please attach the download." });

    expect(result).toBe("mailto");
    expect(clickSpy).toHaveBeenCalledTimes(1); // the PDF was downloaded
    expect(hrefSetTo).toContain("mailto:clinic@x.test");
    expect(hrefSetTo).toContain(`subject=${encodeURIComponent("Tax invoice")}`);
    // The attach note rides along in the body since mailto can't carry the file itself.
    expect(decodeURIComponent(hrefSetTo!)).toContain("Please attach the download.");
  });

  it("opens a recipient-less compose when no email is on file", async () => {
    const result = await shareOrMailFile({ ...base, email: undefined });
    expect(result).toBe("mailto");
    expect(hrefSetTo!.startsWith("mailto:?")).toBe(true);
  });

  it("treats a dismissed share sheet as done — no second compose window", async () => {
    (navigator as { share?: unknown }).share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    (navigator as { canShare?: unknown }).canShare = () => true;

    const result = await shareOrMailFile(base);

    expect(result).toBe("cancelled");
    expect(clickSpy).not.toHaveBeenCalled();
    expect(hrefSetTo).toBeNull();
  });

  it("falls through to mailto when the share call fails for a non-abort reason", async () => {
    (navigator as { share?: unknown }).share = vi.fn().mockRejectedValue(new Error("share broke"));
    (navigator as { canShare?: unknown }).canShare = () => true;

    const result = await shareOrMailFile(base);

    expect(result).toBe("mailto");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(hrefSetTo).toContain("mailto:clinic@x.test");
  });
});
