// Ported from iOS AXDomain/Aftercare.swift. Instruction templates copied verbatim.

export const AFTERCARE_CATEGORIES = [
  "antiwrinkle", "skinbooster", "haFiller", "fatDissolve", "fillerDissolve",
] as const;
export type AftercareCategory = (typeof AFTERCARE_CATEGORIES)[number];

export function aftercareDisplayName(c: AftercareCategory): string {
  switch (c) {
    case "antiwrinkle": return "Antiwrinkle";
    case "skinbooster": return "Skinbooster";
    case "haFiller": return "HA filler";
    case "fatDissolve": return "Fat dissolve";
    case "fillerDissolve": return "Filler dissolve";
  }
}

export function aftercareTemplate(c: AftercareCategory): string {
  switch (c) {
    case "antiwrinkle":
      return "Avoid touching or massaging the treated area for 4 hours. Stay upright for 4 hours and skip strenuous exercise, saunas, and alcohol for 24 hours. Small injection bumps settle within an hour; results appear over 3–14 days. Contact us about any drooping, double vision, or difficulty swallowing.";
    case "skinbooster":
      return "Small papules at the injection points are normal and settle within 48 hours. Avoid make-up for the rest of today, and saunas, pools, and intense exercise for 48 hours. Moisturise and use SPF daily. Contact us if any site becomes hot, painful, or worse after 48 hours.";
    case "haFiller":
      return "Swelling and bruising are common for several days — ice in short intervals helps. Avoid pressure on the area (including sleeping face-down), make-up for 24 hours, and heat, alcohol, or hard exercise for 48 hours. Lumps usually soften over 2 weeks. URGENT: contact us immediately for unusual pain, white or mottled skin, or changes in vision.";
    case "fatDissolve":
      return "Expect noticeable swelling for 3–7 days plus tenderness, firmness, and possible numbness — this is the treatment working. Wear the compression garment if provided. Avoid anti-inflammatories for 48 hours where possible, and heat or hard exercise for 72 hours. Contact us about blistering, skin changes, or an uneven smile.";
    case "fillerDissolve":
      return "The enzyme works quickly — most softening happens within 24–48 hours, and some of your own tissue hyaluronic acid may temporarily soften too; this replenishes over weeks. Swelling today is normal. A review in 2 weeks confirms whether a further session or re-treatment is appropriate. Contact us about any rash or itching.";
  }
}

// Matches iOS AftercareComposer.assemble: each section headed by the uppercased
// display name, joined by a blank line, preserving selection order.
export function assembleAftercare(categories: AftercareCategory[]): string {
  return categories
    .map((c) => `— ${aftercareDisplayName(c).toUpperCase()} —\n${aftercareTemplate(c)}`)
    .join("\n\n");
}

// --- Email composition -------------------------------------------------------
// Aftercare leaves through the practitioner's own mail client (same hand-off as
// "Send a consent to sign"), so these build a prefill — nothing here sends.

export const AFTERCARE_DEFAULT_BODY =
  "Thank you for visiting. Avoid touching the treated area for 4 hours, no strenuous exercise for 24 hours, and contact us with any concerns.";

/**
 * Closing line for every aftercare email (19/07 owner feedback).
 *
 * Deliberately NOT "this is an automated system email, do not reply": the mail is composed and
 * sent from the practitioner's own address, so a reply reaches them — and several templates end
 * with urgent-symptom instructions ("URGENT: contact us immediately for … changes in vision"),
 * which a "do not reply" line sitting beneath could delay someone acting on.
 */
export const AFTERCARE_CLOSING =
  "If you have any questions or concerns about your treatment, please contact your practitioner directly.";

/**
 * The email body: the ticked categories' templates (or the default text when none are ticked),
 * always closed by AFTERCARE_CLOSING exactly once — the closing lives here rather than in each
 * template so a multi-category send doesn't repeat it per section.
 */
export function aftercareBody(categories: AftercareCategory[]): string {
  const main = categories.length ? assembleAftercare(categories) : AFTERCARE_DEFAULT_BODY;
  return `${main}\n\n${AFTERCARE_CLOSING}`;
}

/** Subject + body for the mailto prefill, mirroring remoteSigning's consentEmail. */
export function aftercareEmail(patientName: string, body: string): { subject: string; body: string } {
  const name = patientName.trim();
  return {
    subject: "Your aftercare instructions",
    body: [name ? `Hi ${name},` : "Hi,", "", body].join("\n"),
  };
}
