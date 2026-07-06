// Pure helpers for remote consent signing links. No Firebase/React imports.
import { FORM_TEMPLATE_KINDS, type FormTemplateKind } from "./forms";

// Matches the backend createFormLink default (FORMS_BASE_URL).
export const FORM_LINK_BASE_URL = "https://aestheticx-91e6b.web.app";

// Every form template can be sent for remote signing, including the Aesthetic History
// intake (owner feedback #3). LIVE DEPENDENCY: the deployed public sign.html must render the
// aesthetic-history intake for a remote link to display in production — until then, remote
// aesthetic-history links only render in the demo. Tracked separately from this web repo.
export function remoteSigningTemplateKinds(): FormTemplateKind[] {
  return [...FORM_TEMPLATE_KINDS];
}

export function formSigningUrl(token: string): string {
  return `${FORM_LINK_BASE_URL}/s/${token}`;
}

export function consentEmail(patientName: string, url: string): { subject: string; body: string } {
  const greeting = patientName ? `Hi ${patientName},` : "Hi,";
  const subject = "Your consent form to sign";
  const body = [
    greeting,
    "",
    "Please review and sign your consent form using this secure link:",
    url,
    "",
    "This link expires in 7 days and can be used once.",
  ].join("\n");
  return { subject, body };
}

export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
