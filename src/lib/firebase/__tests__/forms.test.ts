import { describe, it, expect, vi, beforeEach } from "vitest";

// fetchSignedFormPdfPath re-reads a signed-form doc for its (async-rendered) pdfFileId.
// Mock the Firestore reads and the mapper so we assert the branching, not Firebase.

const getDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  doc: (..._args: unknown[]) => ({ _args }),
  getDoc: (...args: unknown[]) => getDoc(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ firestore: () => ({}) }));

const mapForm = vi.fn();
vi.mock("@/lib/firebase/mappers", () => ({ mapForm: (...args: unknown[]) => mapForm(...args) }));

import { fetchSignedFormPdfPath } from "@/lib/firebase/forms";

beforeEach(() => {
  getDoc.mockReset();
  mapForm.mockReset();
});

describe("fetchSignedFormPdfPath", () => {
  it("returns the pdfFileId once the doc exists and the PDF is rendered", async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ any: "doc" }) });
    mapForm.mockReturnValue({ pdfFileId: "patients/p1/forms/f1.pdf" });
    await expect(fetchSignedFormPdfPath("p1", "f1")).resolves.toBe("patients/p1/forms/f1.pdf");
  });

  it("returns null when the form doc no longer exists", async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    await expect(fetchSignedFormPdfPath("p1", "f1")).resolves.toBeNull();
    expect(mapForm).not.toHaveBeenCalled();
  });

  it("returns null while the PDF is not yet rendered (no pdfFileId)", async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
    mapForm.mockReturnValue({ pdfFileId: undefined });
    await expect(fetchSignedFormPdfPath("p1", "f1")).resolves.toBeNull();
  });
});
