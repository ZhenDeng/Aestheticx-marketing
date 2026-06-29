// Pure helpers for remote consent signing links. No Firebase/React imports.
import { FORM_TEMPLATE_KINDS, type FormTemplateKind } from "./forms";

// Matches the backend createFormLink default (FORMS_BASE_URL).
export const FORM_LINK_BASE_URL = "https://aestheticx-91e6b.web.app";

// The deployed public sign.html only renders consent-style questions, so the
// Aesthetic History intake is not offered for remote signing.
export function remoteSigningTemplateKinds(): FormTemplateKind[] {
  return FORM_TEMPLATE_KINDS.filter((k) => k !== "aestheticHistory");
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
