// Marketing copy + data. Grounded in AestheticX/openspec/specs and DESIGN.md.
// No invented features, pricing, testimonials, or statistics.
// No real or fake personal/clinic names — scenarios use neutral labels
// (Doctor A, Nurse A, Nurse B, Clinic A, Nurse A @ Clinic A).

export type RoleKey = "rose" | "sage" | "slate" | "umber";

/* ============================================================
   Homepage — general showcase points only
   ============================================================ */
export interface KeyPoint {
  title: string;
  body: string;
}

export const HOME_POINTS: KeyPoint[] = [
  {
    title: "Built for the whole care team",
    body: "Designed for prescribing doctors, injecting nurses, and clinic management teams to work together for optimal patient-care delivery.",
  },
  {
    title: "Patient information at a glance",
    body: "Demographics, allergies, consent, active authorisations, and notes — the whole picture in one condensed file.",
  },
  {
    title: "Safe medical data storage",
    body: "Records and documents are stored securely with Australian data residency, and the file types a practice actually uses are supported.",
  },
  {
    title: "A smooth prescribing workflow",
    body: "A clear request-and-authorise flow keeps consultations efficient, from the treatment chair to the prescriber.",
  },
  {
    title: "Clear communication across the team",
    body: "Everyone shares one record and one source of truth, so the whole care team stays in sync.",
  },
  {
    title: "An inbuilt appointment system",
    body: "Booking is built in — between the public and nurses, and between nurses and prescribing doctors.",
  },
];

/* ============================================================
   Role-tint demo — identity switching (lives on role pages)
   ============================================================ */
export interface Role {
  key: RoleKey;
  identity: string;
  context: string;
  badge: string;
  note: string;
}

export const ROLES: Role[] = [
  {
    key: "rose",
    identity: "Independent nurse",
    context: "Nurse A",
    badge: "RN · Independent",
    note: "Working under your own ABN and AHPRA registration — your patients, your scope.",
  },
  {
    key: "sage",
    identity: "Clinic clinician",
    context: "Nurse A @ Clinic A",
    badge: "RN · Clinic A",
    note: "The same nurse, now charting on behalf of the clinic. The tint is the confirmation.",
  },
  {
    key: "slate",
    identity: "Clinic admin",
    context: "Clinic A · Front desk",
    badge: "Admin · Clinic A",
    note: "Manage patients, merge duplicate files, and run the books — without clinical write access.",
  },
  {
    key: "umber",
    identity: "Prescribing doctor",
    context: "Doctor A",
    badge: "Prescriber · Authorising",
    note: "Review requests, approve or require edits, and issue authorisations from anywhere.",
  },
];

/* ============================================================
   Role subpages — detailed guides, classed by role
   ============================================================ */
export type RoleSlug = "doctors" | "nurses" | "clinics";

export interface GuideSection {
  title: string;
  body: string;
}

export interface RolePage {
  slug: RoleSlug;
  key: RoleKey;
  eyebrow: string; // mono kicker label
  title: string;
  tagline: string;
  intro: string;
  sections: GuideSection[];
}

export const ROLE_PAGES: Record<RoleSlug, RolePage> = {
  doctors: {
    slug: "doctors",
    key: "umber",
    eyebrow: "For prescribing doctors",
    title: "Authorise from anywhere, with the patient in full view",
    tagline: "Review what injecting nurses request and decide what gets authorised.",
    intro:
      "As a prescribing doctor you review the requests injecting nurses raise and decide what is authorised — on a teleconsult, with the patient's record beside the call.",
    sections: [
      {
        title: "Review requests with full context",
        body: "When Nurse A raises a request, the patient summary sits above it in a gold-sealed box — demographics, allergies, and active authorisations. You approve it, or require an edit; there is no flat reject.",
      },
      {
        title: "Consult on a split screen",
        body: "Launch a teleconsult and see live video above a scrollable clinical summary. Incoming calls ring through CallKit so a consultation is never missed.",
      },
      {
        title: "Issue authorisations that track themselves",
        body: "Each approval issues per-medication authorisations carrying five repeats and a six-month expiry. Repeats are consumed automatically as treatment notes are saved.",
      },
      {
        title: "See the patients you're responsible for",
        body: "Access follows the authorisations you've issued, so the files you need are in reach without exposing the whole clinic.",
      },
      {
        title: "Export for the record",
        body: "Any authorisation exports to a clean A4 PDF that reuses the same print grammar as invoices and legal documents.",
      },
    ],
  },
  nurses: {
    slug: "nurses",
    key: "rose",
    eyebrow: "For injecting nurses",
    title: "Run your list — independently, or under a clinic",
    tagline: "Your patients, consent, and authorisations in one place — always under the right identity.",
    intro:
      "Whether you work for yourself or for a clinic, AestheticX keeps your patients, consent, and authorisations together — and makes sure you are always charting as the right identity.",
    sections: [
      {
        title: "Independent or under a clinic",
        body: "Switch identity on your profile and the whole interface re-tints. Nurse A working independently and Nurse A @ Clinic A are clearly different contexts, so a treatment is never recorded under the wrong practice.",
      },
      {
        title: "Build the patient file in one pass",
        body: "Capture the mandatory intake — name, date of birth, contact, allergies, and current medications — then search by name, DOB, or phone. Allergies are flagged, never buried.",
      },
      {
        title: "Send consent that signs itself out",
        body: "Seven templates with demographics autofilled. Patients sign in-app, by email, by QR, or by link, with the off-label clause sealed into every consent.",
      },
      {
        title: "Request an authorisation from the file",
        body: "Raise a request to a prescribing doctor (for example, Doctor A) straight from the patient file, and watch remaining repeats as gold dots.",
      },
      {
        title: "Chart treatments and aftercare",
        body: "Treatment notes consume repeats automatically; aftercare emails assemble from templates and report back whether they were delivered or failed.",
      },
      {
        title: "Book the way your day works",
        body: "Take public bookings through your own link and QR code, and book authorisation slots with prescribing doctors.",
      },
    ],
  },
  clinics: {
    slug: "clinics",
    key: "slate",
    eyebrow: "For clinic management",
    title: "Coordinate the whole team, and keep the books straight",
    tagline: "Run patients, appointments, and authorisation-based billing across everyone.",
    intro:
      "The clinic management team runs patients, appointments, and authorisation-based billing across everyone — with the access to organise, without clinical write.",
    sections: [
      {
        title: "One patient list for the whole team",
        body: "Visibility follows practice context, so clinicians see the right patients. Merge duplicate files cleanly when they appear.",
      },
      {
        title: "Count what's billable",
        body: "Each approved authorisation request counts as exactly one billable authorisation against the requesting party — for example Nurse A, or Nurse A @ Clinic A. AestheticX counts authorisations; it does not process payments.",
      },
      {
        title: "Drill down by month and counterparty",
        body: "Monthly statistics unfold to counterparties and then to individual authorisations, with ad-hoc timeframes when you need them.",
      },
      {
        title: "Raise a clean tax invoice",
        body: "Generate an A4 GST tax invoice carrying both parties' business details, ABN, and a hairline line-item table.",
      },
      {
        title: "See the business at a glance",
        body: "Clinic business statistics reuse the same ledger grammar so owners can read performance quickly.",
      },
      {
        title: "Give the right people the right access",
        body: "Admins manage patients, appointments, and billing without clinical write access.",
      },
    ],
  },
};

export const ROLE_ORDER: RoleSlug[] = ["doctors", "nurses", "clinics"];

/* ============================================================
   Shared — compliance, FAQ, audience cards
   ============================================================ */
export interface ComplianceItem {
  label: string;
  body: string;
}

export const COMPLIANCE: ComplianceItem[] = [
  {
    label: "Australian data residency",
    body: "Patient avatars, note photos, signed-form PDFs, and invoices are stored securely with Australian data residency and short-lived signed download links.",
  },
  {
    label: "Server-enforced integrity",
    body: "Authorisations, repeat consumption, billing events, and merges happen only inside server transactions. Direct client writes are blocked.",
  },
  {
    label: "Account security",
    body: "First-login password set with a strength meter, and a Face-ID lock that gates the interface without ending the session.",
  },
  {
    label: "Off-label by template",
    body: "Every consent form carries a mandatory, non-removable off-label clause — set apart with a gold seal.",
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "Who is AestheticX for?",
    a: "Australian aesthetic-medicine practices — prescribing doctors, injecting nurses, and clinic management teams. It supports both independent practitioners and clinic teams, with separate practice contexts for each.",
  },
  {
    q: "What platform does it run on?",
    a: "AestheticX is an iOS app, built with SwiftUI for iPhone and iPad. Patient self-booking and consent signing also work on the mobile web.",
  },
  {
    q: "Does AestheticX process payments?",
    a: "No. AestheticX counts billable authorisations and generates GST tax invoices, but it does not take or process payments. Settlement happens through your own arrangements.",
  },
  {
    q: "How does the prescribing workflow work?",
    a: "An injecting nurse raises a request from the patient file. The prescribing doctor reviews it — often on a split-screen teleconsult — and either approves it or requires an edit. Approval issues per-medication authorisations with five repeats and a six-month expiry.",
  },
  {
    q: "Where is patient data stored?",
    a: "Data and documents are stored securely with Australian data residency, behind rules that mirror patient visibility. Integrity-critical writes are enforced server-side.",
  },
  {
    q: "Is this medical or legal advice?",
    a: "No. AestheticX is practice software that supports your clinical and administrative workflow. It does not provide medical or legal advice, and it does not replace your professional judgement or obligations.",
  },
];

export interface Audience {
  slug: RoleSlug;
  key: RoleKey;
  who: string;
  line: string;
}

export const AUDIENCES: Audience[] = [
  {
    slug: "doctors",
    key: "umber",
    who: "Prescribing doctors",
    line: "Review and authorise from anywhere, with the patient's file live beside the call.",
  },
  {
    slug: "nurses",
    key: "rose",
    who: "Injecting nurses",
    line: "Raise authorisation requests, chart treatments, and take bookings — independently or under a clinic.",
  },
  {
    slug: "clinics",
    key: "slate",
    who: "Clinic management",
    line: "Run patients, appointments, merges, and authorisation-based billing across the whole team.",
  },
];
