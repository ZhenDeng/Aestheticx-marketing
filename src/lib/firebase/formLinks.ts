"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./client";
import type { FormTemplateKind } from "@/lib/demo/forms";

export interface CreatedFormLink {
  token: string;
  url: string;
}

// Mints a single-use signing link via the backend createFormLink onCall Function.
// Returns the patient-facing URL (pointing at the deployed sign.html).
export async function createFormLink(patientID: string, template: FormTemplateKind): Promise<CreatedFormLink> {
  const res = await httpsCallable(functions(), "createFormLink")({ patientId: patientID, template });
  const data = res.data as { token?: string; url?: string };
  if (!data?.url) throw new Error("createFormLink returned no url");
  return { token: data.token ?? "", url: data.url };
}
