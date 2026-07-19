// Template texts from the owner's 19/07 "aftercare template all treatment" document,
// content verbatim (bold labels flattened to "Label:" prefixes; each document's closing
// sentence is appended once by aftercareBody instead of living in every template).
// Supersedes the iOS AXDomain/Aftercare.swift five-category port — iOS parity follow-up
// is noted in the openspec change.

export const AFTERCARE_CATEGORIES = [
  "antiwrinkle", "skinbooster", "haFiller", "biostimulatorFiller",
  "biostimulatorRejuvenation", "fatDissolve", "fillerDissolve", "prpPrf",
] as const;
export type AftercareCategory = (typeof AFTERCARE_CATEGORIES)[number];

export function aftercareDisplayName(c: AftercareCategory): string {
  switch (c) {
    case "antiwrinkle": return "Anti-wrinkle";
    case "skinbooster": return "Skinbooster";
    case "haFiller": return "HA filler";
    case "biostimulatorFiller": return "Biostimulator filler";
    case "biostimulatorRejuvenation": return "Biostimulator rejuvenation";
    case "fatDissolve": return "Fat dissolve";
    case "fillerDissolve": return "Filler dissolve (Hylase)";
    case "prpPrf": return "PRP / PRF";
  }
}

export function aftercareTemplate(c: AftercareCategory): string {
  switch (c) {
    case "antiwrinkle":
      return [
        "Thank you for choosing us for your anti-wrinkle treatment today. To ensure optimal product distribution and the best possible outcome, please follow these post-treatment instructions:",
        "",
        "Keep Upright: Please remain upright for at least 4 hours post-injection. Do not lie flat or lean forward excessively to prevent the product from migrating.",
        "Do Not Massage: Avoid rubbing, massaging, or applying firm pressure to the treated areas for the next 24 hours.",
        "Exercise & Heat: Avoid strenuous exercise, heavy sweating, saunas, steam rooms, and hot baths for 24–48 hours.",
        "Alcohol: Avoid alcohol consumption for 24–48 hours as it can increase blood circulation and alter your healing response.",
        "Timeline to Results: Please note that the effects will gradually begin to appear within 3–4 days, with the final, settled outcome visible at the 2-week mark.",
        "",
        "If this is your first session, we highly recommend booking a complimentary 2-week review.",
      ].join("\n");
    case "skinbooster":
      return [
        "Your Skinbooster treatment is complete! Because this protocol targets the shallow dermis to boost overall hydration and skin quality, your skin requires gentle care over the next few days:",
        "",
        "Tiny Papules / Bumps: It is completely normal to see small, raised bumps (papules) or mild redness at the injection sites. This is the Skinbooster holding hydration in the skin and typically settles within 24 to 72 hours.",
        "Exercise & Heat: Avoid strenuous exercise, heavy sweating, saunas, steam rooms, and hot baths for 24–48 hours to prevent extra inflammation.",
        "Alcohol: Avoid alcohol consumption for 24–48 hours to minimize prolonged swelling or redness at the micro-injection sites.",
        "Hygiene & Touching: Do not touch your face for at least 6 hours post-treatment to prevent micro-infections.",
        "Skincare & Makeup: Avoid applying heavy makeup or active skincare products (AHAs, BHAs, Retinols, Vitamin C) for 24 hours. Stick to a gentle cleanser and a basic hydrating cream.",
        "Sun Protection: Avoid direct sun exposure. Once the 24-hour mark passes, ensure you apply a broad-spectrum SPF 50+ daily.",
      ].join("\n");
    case "haFiller":
      return [
        "Thank you for trusting us with your facial dermal filler treatment today. Because hyaluronic acid (HA) fillers require time to completely integrate with your facial tissue layers, please adhere to the following guidelines:",
        "",
        "Avoid Pressure: Do not press, massage, or manipulate the treated areas unless explicitly instructed by your practitioner. Try to sleep flat on your back for the next 3–5 nights to avoid asymmetrical pressure on the fresh filler.",
        "Exercise & Heat: Avoid strenuous exercise, heavy sweating, saunas, steam rooms, and hot baths for 24–48 hours. High heat and heart rates can exacerbate localized swelling.",
        "Alcohol: Avoid alcohol consumption for 24–48 hours as it expands blood vessels and can significantly worsen bruising and swelling.",
        "Swelling & Bruising: Mild to moderate swelling, asymmetry, temporary hardness, and bruising are standard inflammatory responses. These typically peak within 48 hours and can take 2 to 4 weeks to fully resolve.",
        "Pain Management: Mild tenderness is expected. If needed, please use Paracetamol. Avoid anti-inflammatory medications (such as Ibuprofen/Nurofen or Aspirin) as they thin the blood and worsen bruising.",
      ].join("\n");
    case "biostimulatorFiller":
      return [
        "Today we administered your structural biostimulator filler treatment to provide immediate support and promote long-term collagen synthesis. Please review your specialized aftercare instructions:",
        "",
        "NO Aggressive Manipulation: These structural materials are strategically placed to act as a supportive matrix. Do not massage or apply aggressive pressure to the treated zones. We want the material to remain perfectly positioned where placed.",
        "Exercise & Heat: Avoid strenuous exercise, heavy sweating, saunas, steam rooms, and hot baths for 48 hours to protect the newly established structural framework.",
        "Alcohol: Avoid alcohol consumption for 24–48 hours to minimize vascular dilation and reduce the risk of secondary bruising around the deep injection sites.",
        "Swelling & Structural Firmness: The treated zones may feel unusually firm, tender, or slightly uneven initially. This is a normal part of the bio-integration phase. The initial swelling will settle in a few days, and your own collagen will gradually replace the matrix over the coming months.",
        "Pain Relief: For any post-treatment discomfort, please use standard Paracetamol. Avoid Ibuprofen/Nurofen.",
      ].join("\n");
    case "biostimulatorRejuvenation":
      return [
        "Your biostimulator facial rejuvenation treatment is complete! Because these materials are diluted and spread evenly across the dermal layers to trigger a widespread skin-tightening response, please follow these specific rules:",
        "",
        "Crucial Massage Instructions (The 5-5-5 Rule):",
        "If you received Sculptra or Lenisna (PLLA/PDLLA): You must strictly follow the massage rule to ensure even distribution of the particles and prevent nodule formation: Massage the treated areas for 5 minutes, 5 times a day, for 5 consecutive days. Use a gentle moisturizer or cleanser to avoid friction.",
        "If you received Gouri or other specific liquid biostimulators: Do NOT massage unless explicitly told otherwise by your practitioner.",
        "Exercise & Heat: Avoid strenuous exercise, heavy sweating, saunas, steam rooms, and hot baths for 24–48 hours to maintain a stable environment for dermal remodeling.",
        "Alcohol: Avoid alcohol consumption for 24–48 hours to keep baseline facial swelling to a minimum.",
        "Gradual Results Timeline: Remember, this is a collagen-regeneration journey. The immediate plumpness you see right now is just the sterile water matrix, which your body will absorb within a few days. Your true, lasting skin-tightening results will gradually develop over the next 2 to 4 months.",
        "Skincare: Avoid facial scrubs, active chemical peels, or laser treatments for at least 2 weeks.",
      ].join("\n");
    case "fatDissolve":
      return [
        "Thank you for visiting us today. The fat dissolving treatment you received works by inducing a targeted localized inflammatory response to break down unwanted adipose tissue. Because of this unique process, the aftercare is highly specific:",
        "",
        "Embrace the Swelling: Significant swelling, redness, firmness, and a \"jelly-like\" feeling in the treated area (e.g., under the chin) are completely expected and actually indicate that the treatment is working actively. Swelling usually peaks at 48 hours and can last for 1–2 weeks.",
        "Exercise & Heat: Avoid strenuous exercise, heavy sweating, saunas, steam rooms, and hot baths for 48 hours. Allowing your body temperature to spike prematurely can aggravate the massive localized swelling.",
        "Alcohol: Avoid alcohol consumption for 48 hours. Alcohol causes fluid retention and blood thinning, which can worsen both swelling and bruising in the treated profile.",
        "CRITICAL - No Anti-Inflammatories: Do NOT take Nurofen, Ibuprofen, Voltaren, or any other anti-inflammatory medications. These drugs will suppress the exact inflammatory reaction required to destroy the fat cells. If you experience discomfort, take Paracetamol only.",
        "Massage: You may begin gently massaging the area after 72 hours to help flush out the disrupted tissue, if advised by your practitioner.",
        "Hydration: Drink plenty of water over the next week to assist your lymphatic system in processing and clearing the broken-down compounds.",
      ].join("\n");
    case "fillerDissolve":
      return [
        "Today we administered a Hylase treatment to safely dissolve existing hyaluronic acid dermal fillers. The enzyme acts very rapidly, and the area will undergo significant changes over the next few days:",
        "",
        "Exercise & Heat: Avoid strenuous exercise, heavy sweating, saunas, steam rooms, and hot baths for 24–48 hours to let the enzymatic reaction stabilize without increased systemic blood flow.",
        "Alcohol: Avoid alcohol consumption for 24–48 hours. Since Hylase inherently increases the permeability of tissues, alcohol can rapidly worsen the bruising commonly associated with this treatment.",
        "Immediate Flattening & Swelling: Hylase works instantly, which can cause temporary localized swelling, tenderness, and an immediate flattening of the tissue contour. The treated area may feel temporarily \"empty\" or deflated as the filler breaks down.",
        "Tissue Stabilization: It takes approximately 3 to 7 days for the Hylase enzyme to completely finish its cycle and for your natural tissue hydration levels to normalize.",
        "Next Steps: Do not attempt any new dermal filler treatments in this exact area for at least 2 full weeks to ensure the Hylase is completely inactive and cleared from the tissue.",
      ].join("\n");
    case "prpPrf":
      return [
        "Your autologous cellular rejuvenation treatment utilizing your body’s own natural growth factors (PRP/PRF) is complete. To give these delicate cells the best environment to stimulate collagen and revitalize your tissue, please follow these guidelines:",
        "",
        "Do Not Wash Immediately: For optimal absorption, leave the remaining plasma matrix on your skin for at least 6 to 12 hours before washing. When you do wash, use only lukewarm water and a very gentle, basic cleanser.",
        "Exercise & Heat: Avoid strenuous exercise, heavy sweating, saunas, steam rooms, and hot baths for 24–48 hours to ensure the injected growth factors are not prematurely flushed out by sweat or excessive micro-circulation.",
        "Alcohol: Avoid alcohol and smoking for 48 hours as they compromise cellular recovery and can diminish the overall regenerative potency of the treatment.",
        "Skincare Restrictions: Strictly avoid active skincare serums (Retinols, Glycolic acids, Vitamin C, Benzoyl Peroxide) and makeup for the next 48 hours. Keep the skin hydrated with a bland, sterile recovery cream.",
        "Redness & Flaking: Your skin may feel warm, pink (resembling a mild sunburn), tight, or dry. Slight flaking may occur around day 3. This is a normal part of the rapid cellular turnover.",
        "Stay Hydrated: Drink plenty of water to enhance cellular recovery from the inside out.",
      ].join("\n");
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
 * Closing line for every aftercare email — the second sentence of the closing in the
 * owner's 19/07 template document.
 *
 * The document's first sentence ("This is an automated system email. Please do not reply
 * directly to this message.") is deliberately NOT adopted: the mail is composed and sent
 * from the practitioner's own address (19/07 mailto hand-off), so a reply reaches them —
 * telling the patient not to reply would be false and could delay someone acting on the
 * symptom guidance above it.
 */
export const AFTERCARE_CLOSING =
  "If you have any questions regarding your care, please contact your designated practitioner directly.";

/**
 * The email body: the ticked categories' templates (or the default text when none are ticked),
 * always closed by AFTERCARE_CLOSING exactly once — the closing lives here rather than in each
 * template so a multi-category send doesn't repeat it per section.
 */
export function aftercareBody(categories: AftercareCategory[]): string {
  const main = categories.length ? assembleAftercare(categories) : AFTERCARE_DEFAULT_BODY;
  return `${main}\n\n${AFTERCARE_CLOSING}`;
}

/**
 * The owner's per-treatment subject line when exactly one category is selected; a generic
 * form otherwise (the document has no combined-treatment subject, and concatenating several
 * would overflow a subject line).
 */
export function aftercareSubject(categories: AftercareCategory[]): string {
  if (categories.length !== 1) return "Your Aftercare Guide";
  switch (categories[0]) {
    case "antiwrinkle": return "Your Aftercare Guide for Anti-wrinkle Treatment";
    case "skinbooster": return "Your Aftercare Guide for Skinbooster Treatment";
    case "haFiller": return "Your Aftercare Guide for HA Dermal Filler Treatment";
    case "biostimulatorFiller": return "Your Aftercare Guide for Biostimulator Filler Treatment (Ellansé / HArmonyCa / Radiesse)";
    case "biostimulatorRejuvenation": return "Your Aftercare Guide for Biostimulator Treatment (Sculptra / Lenisna / Gouri / Hyperdiluted Radiesse)";
    case "fatDissolve": return "Your Aftercare Guide for Fat Dissolving Treatment";
    case "fillerDissolve": return "Your Aftercare Guide for Hylase (Filler Dissolving) Treatment";
    case "prpPrf": return "Your Aftercare Guide for PRP / PRF Treatment";
  }
}

/** Subject + body for the mailto prefill, mirroring remoteSigning's consentEmail. */
export function aftercareEmail(
  patientName: string, body: string, categories: AftercareCategory[],
): { subject: string; body: string } {
  const name = patientName.trim();
  return {
    subject: aftercareSubject(categories),
    body: [name ? `Dear ${name},` : "Dear patient,", "", body].join("\n"),
  };
}
