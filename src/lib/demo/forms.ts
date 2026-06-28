// Ported from iOS AXDomain/Forms.swift + FormLibrary.swift. Legal content copied verbatim.

export const FORM_TEMPLATE_KINDS = [
  "aestheticHistory", "antiwrinkleConsent", "skinboosterConsent", "haFillerConsent",
  "collagenStimulatorConsent", "fatDissolveConsent", "haFillerDissolvingConsent",
] as const;
export type FormTemplateKind = (typeof FORM_TEMPLATE_KINDS)[number];

export type SigningChannel = "onDevice" | "emailLink" | "qrCode" | "shareLink";

export type FormQuestion = {
  id: string;
  prompt: string;
  kind: { type: "yesNo"; detailPrompt: string | null } | { type: "text" };
};

export interface FormTemplate {
  kind: FormTemplateKind;
  intro: string;
  clauses: string[];
  questions: FormQuestion[];
  requiresSignature: boolean;
  fullText: string[];
}

export function templateFullText(t: { intro: string; clauses: string[] }): string[] {
  return [t.intro, ...t.clauses];
}

export function templateDisplayName(kind: FormTemplateKind): string {
  switch (kind) {
    case "aestheticHistory": return "Aesthetic History";
    case "antiwrinkleConsent": return "Antiwrinkle Consent";
    case "skinboosterConsent": return "Skinbooster Consent";
    case "haFillerConsent": return "HA Filler Consent";
    case "collagenStimulatorConsent": return "Collagen Stimulator Consent";
    case "fatDissolveConsent": return "Fat Dissolve Consent";
    case "haFillerDissolvingConsent": return "Hyalase Consent";
  }
}

export const OFF_LABEL_CLAUSE =
  "Off-label use: I understand that many cosmetic injectables (including, but not limited to, neuromodulators and dermal fillers) may be administered in areas, doses, or manners not specifically approved by the TGA. This is a recognised and lawful practice in aesthetic medicine, undertaken at the treating practitioner's clinical judgement, and its rationale has been explained to me to my satisfaction. I consent to off-label use where my practitioner judges it will give the most optimal and balanced aesthetic outcome.";

const PRIVACY_CLAUSE =
  "My personal and health information is collected to provide safe treatment and is handled under the Australian Privacy Principles. It is shared only with practitioners involved in my care.";

const CONSENT_CLOSE_CLAUSE =
  "I confirm I have had the opportunity to ask questions, that alternatives (including no treatment) were discussed, that results vary between individuals and no specific outcome is guaranteed, and that I may withdraw consent at any time before treatment.";

const PHOTOGRAPHY_CLAUSE =
  "Clinical photography: I authorise clinical photography for medical documentation, with use restricted to my medical record unless I provide separate authorisation for teaching or marketing purposes.";

const CONFIRM_QUESTIONS: FormQuestion[] = [
  { id: "changed-history", prompt: "Has your medical history changed since your aesthetic history form?", kind: { type: "yesNo", detailPrompt: "Please describe what has changed" } },
  { id: "questions-answered", prompt: "Have all your questions about today's treatment been answered?", kind: { type: "yesNo", detailPrompt: null } },
];

function consent(kind: FormTemplateKind, intro: string, sections: string[]): FormTemplate {
  const clauses = [...sections, OFF_LABEL_CLAUSE, PRIVACY_CLAUSE, CONSENT_CLOSE_CLAUSE];
  return { kind, intro, clauses, questions: CONFIRM_QUESTIONS, requiresSignature: true, fullText: [intro, ...clauses] };
}

// FormLibrary.swift lines 272-321 — port the 6 strings verbatim; the 6th is photographyClause.
const HA_AND_SKINBOOSTER_SECTIONS: string[] = [
  "Expected effects and common reactions: localised swelling and redness may appear at injection sites and usually resolve on their own. Bruising may persist for around two to three weeks. Temporary over-correction from localised product can occur without discomfort, and transient small lumps may appear, typically settling within 24–48 hours.",
  "Potential serious complications: I acknowledge the possibility of serious complications, including hypersensitivity reactions to filler components, bacterial infection requiring oral antibiotics, and severe infection or abscess formation requiring hospitalisation and possible surgical intervention.",
  "Rare but significant adverse events: I have been informed of rare but serious complications, including permanent tissue discolouration, inflammatory abscess with pus, cerebrovascular events, worsening of pre-existing facial asymmetry, vascular occlusion resulting in tissue death (necrosis), granuloma formation, visual impairment or loss, and keloid scarring.",
  "Patient acknowledgments: I acknowledge that patients far from specialist ophthalmology services may experience delayed access to remedial treatment if complications occur; that any adverse reaction must be reported immediately and may require hyaluronidase or surgical intervention at my expense; that I may need to be available for multiple treatments over a 14-day period, potentially at different locations; that results may be subtle and require multiple treatments, that the procedure will not address pigmentation or under-eye dark circles, and that product migration remains possible; and that cosmetic procedures may worsen existing mental health conditions, including body dysmorphic disorder, anxiety, depression, low self-esteem, OCD, or PTSD.",
  "Limitations and disclaimers: I understand that results may not meet expectations and that multiple appointments may be necessary to complete treatment. This document constitutes full disclosure and supersedes all previous verbal or written communication.",
  PHOTOGRAPHY_CLAUSE,
  "Declaration of understanding: I affirm that I have read and fully understand this consent, that all explanations have been provided to my satisfaction, and that I accept responsibility for acknowledged complications and absolve the treating practitioner and associated medical staff from liability for standard treatment outcomes and acknowledged complications (excluding negligent acts or omissions). I have had adequate opportunity to ask questions and sufficient time to consider the information, including the option to decline or change my decision before proceeding.",
];

const AESTHETIC_HISTORY: FormTemplate = (() => {
  const intro = "This short history helps your practitioner plan safe, effective treatment for you. Most questions are yes/no to save you time — add detail only where asked.";
  const clauses = [PRIVACY_CLAUSE];
  const questions: FormQuestion[] = [
    { id: "medications", prompt: "Are you taking any medications, supplements, or herbal remedies?", kind: { type: "yesNo", detailPrompt: "Please list them" } },
    { id: "medical-condition", prompt: "Do you have any medical condition or health concern we should be aware of?", kind: { type: "yesNo", detailPrompt: "Please describe" } },
    { id: "allergies", prompt: "Are you allergic to any medications, food, or substances?", kind: { type: "yesNo", detailPrompt: "What are you allergic to?" } },
    { id: "cosmetic-reaction", prompt: "Have you had any allergic reaction to a cosmetic procedure or treatment?", kind: { type: "yesNo", detailPrompt: "Which treatment, and what happened?" } },
    { id: "recent-surgery", prompt: "Have you had any recent surgery or cosmetic procedures (within 6 months)?", kind: { type: "yesNo", detailPrompt: "What and when?" } },
    { id: "pregnant", prompt: "Are you currently pregnant, breastfeeding, or trying to conceive?", kind: { type: "yesNo", detailPrompt: null } },
    { id: "conditions-screen", prompt: "Do you have any of the following: allergy or hypersensitivity to injectable components (e.g. botulinum toxin, hyaluronic acid, lidocaine, bee stings) or consumables (e.g. latex); a neurological condition (e.g. myasthenia gravis, ALS, Lambert-Eaton); a blood-clotting disorder (e.g. haemophilia) or diabetes; an immunocompromised condition (e.g. chemotherapy, autoimmune disease); a history of cold sores (herpes simplex); a history of keloid or hypertrophic scarring; cardiovascular disease (e.g. hypertension); or a mental health condition?", kind: { type: "yesNo", detailPrompt: "Please indicate which" } },
    { id: "photo-clinical", prompt: "I consent to my photograph being taken for the purpose of clinical review.", kind: { type: "yesNo", detailPrompt: null } },
    { id: "photo-marketing", prompt: "I consent to the use of my photographs and/or video for education, training, advertising, and social media.", kind: { type: "yesNo", detailPrompt: null } },
  ];
  return { kind: "aestheticHistory", intro, clauses, questions, requiresSignature: true, fullText: [intro, ...clauses] };
})();

export function formTemplate(kind: FormTemplateKind): FormTemplate {
  switch (kind) {
    case "aestheticHistory": return AESTHETIC_HISTORY;
    case "antiwrinkleConsent":
      return consent(kind,
        "Antiwrinkle injections (botulinum toxin type A) are one of the most widely performed and well-studied aesthetic treatments worldwide. They soften expression lines, can prevent deeper lines forming, and typically need no downtime. Effects appear over 3–14 days and usually last 3–4 months. Please review the points below before consenting.",
        [
          "Potential risks and complications: these include, but are not limited to, localised bleeding, bruising, swelling, and infection at injection sites. Additional risks include temporary functional changes in the treated area, facial asymmetry, hypersensitivity reactions, headache, vasodilation (flushing), and influenza-like symptoms.",
          "Medical history and current health: I confirm complete disclosure of my medical history, including any prior conditions, history of keloid formation, autoimmune disorders, neuromuscular conditions, known allergies, and current medications. I affirm that I am not currently pregnant or breastfeeding and that there are no active infections in the treated areas.",
          "Treatment expectations and outcomes: I acknowledge that results cannot be guaranteed and may not meet my expectations, and that cosmetic procedures may affect mental health, potentially contributing to anxiety, depression, or body-dysmorphic symptoms. Some patients develop antibodies to the treatment, which can require a 12-month interruption for which no refunds are provided. I recognise that the practice of medicine inherently involves some uncertainty.",
          "Financial agreement: I acknowledge that I understand all treatment costs as explained, including potential additional specialist fees for the management of any complication.",
          PHOTOGRAPHY_CLAUSE,
          "Authorisation and release: I authorise the treating practitioner to perform Botulinum Toxin Type A (BTXA) injections and confirm I have read and understand this consent, that my questions have been answered, and that I will follow all pre- and post-procedure instructions. I release the treating practitioner and associated medical staff from liability for standard treatment outcomes and acknowledged complications; this release excludes negligent acts or omissions.",
        ]);
    case "haFillerConsent":
      return consent(kind,
        "Hyaluronic acid (HA) dermal fillers restore volume, smooth contours, and enhance features using a substance naturally found in skin. Results are immediate, refinable, and — uniquely among fillers — reversible with hyaluronidase should you wish.",
        HA_AND_SKINBOOSTER_SECTIONS);
    case "skinboosterConsent":
      return consent(kind,
        "Skinboosters deliver micro-injections of hyaluronic acid to improve skin hydration, elasticity, and fine crepiness with a natural finish — they refresh skin quality rather than change your features. Results build over a course of treatments and suit most skin types.",
        HA_AND_SKINBOOSTER_SECTIONS);
    case "collagenStimulatorConsent":
      return consent(kind,
        "Collagen-stimulating injectables work with your own biology: they prompt gradual new collagen formation for firmer, naturally fuller-looking skin, with results that develop over weeks and can last well beyond conventional fillers.",
        [
          "Treatment overview: collagen stimulator treatments include products such as Sculptra, Radiesse, Ellansé, HarmonyCa, and Lenisna (Juvelook), among others. They stimulate your body's natural collagen production to gradually improve skin quality, volume, and the appearance of wrinkles and folds. Results are not immediate and typically develop over weeks to months; longevity varies by product and individual, and no specific outcome or duration of effect can be guaranteed.",
          "Potential risks and complications: as with any injectable procedure, these may include, but are not limited to, redness, swelling, bruising, pain, tenderness, itching, and bleeding; infection; lumps, nodules, or granuloma formation (which may be delayed); asymmetry or an unsatisfactory aesthetic outcome; product migration; vascular occlusion (rare but serious), which may lead to tissue damage; and allergic or inflammatory reactions. Some complications may require additional treatment, and outcomes cannot be guaranteed.",
          "Treatment course and aftercare: I understand that multiple sessions may be required for optimal results and that maintenance treatments may be necessary. I agree to follow all aftercare instructions, which may include massage protocols (if applicable), avoiding excessive sun exposure, limiting strenuous activity, and monitoring for unusual symptoms, and to contact my provider promptly with any concerns.",
          "Alternatives: alternative treatments have been discussed with me, including other dermal fillers, energy-based devices, surgical options, or no treatment.",
          PHOTOGRAPHY_CLAUSE,
          "Financial consent and acknowledgment: I acknowledge that the costs of treatment, including the number of sessions potentially required, have been explained, and that as a cosmetic procedure payment is my responsibility. I confirm that the expected outcomes, limitations, and costs have been discussed; that my questions have been answered to my satisfaction; that I have had sufficient time to consider the information, including the option to decline or change my decision; that I understand the risks, benefits, and alternatives and give my informed consent to proceed; and that I am not pregnant or breastfeeding and have disclosed my full medical history.",
        ]);
    case "fatDissolveConsent":
      return consent(kind,
        "Fat-dissolving injections offer a non-surgical way to reduce localised, diet-resistant fat pockets (such as under the chin), permanently destroying treated fat cells with results that develop over a course of sessions.",
        [
          "Swelling is expected and can be pronounced for several days; bruising, numbness, firmness, and tenderness are common and temporary. Uncommon effects include uneven contour or prolonged numbness; rare effects include skin injury at the treatment area. Treatment is staged to keep each session conservative.",
        ]);
    case "haFillerDissolvingConsent":
      return consent(kind,
        "Hyaluronidase (Hyalase) is an enzyme that safely dissolves unwanted or misplaced HA filler, restoring your natural contours — often within 24–48 hours. It is the established corrective tool that makes HA filler treatments adjustable and reversible.",
        [
          "The procedure involves: injection of hyaluronidase directly into the area where hyaluronic acid filler is present; a possible need for multiple treatments to achieve the desired correction; and a follow-up assessment to evaluate results.",
          "Risks and side effects: I have been informed of temporary swelling, redness, or bruising; a temporary increase in the appearance of lines or wrinkles as filler dissolves; uneven or incomplete dissolution of filler; allergic reactions ranging from mild to severe; infection at the injection site; pain or discomfort; over-correction (excessive filler dissolution); severe allergic reaction (anaphylaxis); tissue necrosis; and scarring.",
          "Allergy precautions: I understand that allergic reactions to hyaluronidase can occur. I have disclosed all known allergies, particularly to bee or wasp venom, previous hyaluronidase treatments, and other enzymes or medications.",
          "What I understand: results are not guaranteed; multiple treatments may be necessary; the original filler will be partially or completely dissolved; and follow-up filler treatment should not be performed for at least two weeks. I am not pregnant or breastfeeding, and I understand the safety of hyaluronidase during pregnancy or breastfeeding has not been established.",
          "Consent: I confirm that my questions have been answered satisfactorily, that no guarantees have been made about the outcome, that I have disclosed my complete medical history including allergies and medications, that I consent to photographs for medical documentation, and that I understand additional treatments may incur additional costs.",
        ]);
  }
}
