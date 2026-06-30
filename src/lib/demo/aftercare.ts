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
