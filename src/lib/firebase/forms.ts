"use client";

import { doc, getDoc } from "firebase/firestore";
import { firestore } from "./client";
import { mapForm } from "./mappers";

// Live-only: re-read a signed form doc to get its current pdfFileId. The
// finalizeSignedForm Function renders the PDF asynchronously after the form is
// created, so a just-signed form's local record may not carry pdfFileId yet.
// Returns the Storage path, or null if the doc is gone or the PDF isn't ready.
export async function fetchSignedFormPdfPath(patientID: string, formId: string): Promise<string | null> {
  const snap = await getDoc(doc(firestore(), `patients/${patientID}/forms`, formId));
  if (!snap.exists()) return null;
  return mapForm(formId, patientID, snap.data() as Record<string, unknown>).pdfFileId ?? null;
}
