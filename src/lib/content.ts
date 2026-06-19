// Marketing copy + data. Grounded in AestheticX/openspec/specs and DESIGN.md.
// No invented features, pricing, testimonials, or statistics.

export type RoleKey = "rose" | "sage" | "slate" | "umber";

export interface Role {
  key: RoleKey;
  identity: string;
  context: string;
  badge: string;
  note: string;
}

// The role-tint system — switching identity re-tints the whole interface.
export const ROLES: Role[] = [
  {
    key: "rose",
    identity: "Independent nurse",
    context: "Sarah Chen",
    badge: "RN · Independent",
    note: "Working under your own ABN and AHPRA registration — your patients, your scope.",
  },
  {
    key: "sage",
    identity: "Clinic clinician",
    context: "Sarah Chen @ Lumière",
    badge: "RN · Lumière Clinic",
    note: "The same nurse, now charting on behalf of the clinic. The tint is the confirmation.",
  },
  {
    key: "slate",
    identity: "Clinic admin",
    context: "Front desk @ Lumière",
    badge: "Admin · Lumière",
    note: "Manage patients, merge duplicate files, and run the books — without clinical write access.",
  },
  {
    key: "umber",
    identity: "Doctor",
    context: "Dr. Elise Okafor",
    badge: "Prescriber · Authorising",
    note: "Review requests, approve or require edits, and issue authorisations from anywhere.",
  },
];

export interface Feature {
  id: string;
  tag: string;
  title: string;
  body: string;
  points: string[];
}

// Feature sections, grouped sensibly from the 9 capabilities.
export const FEATURES: Feature[] = [
  {
    id: "authorisations",
    tag: "Treatment authorisations",
    title: "The nurse-to-doctor authorisation, handled end to end",
    body: "A nurse raises a request from the patient file; the prescribing doctor approves it or requires an edit — never a flat reject. Each approval issues per-medication authorisations carrying five repeats and a six-month expiry, with repeats consumed automatically as treatment notes are saved.",
    points: [
      "Request → approve / require-edit, with a teleconsult alongside",
      "5 repeats, 6-month expiry, repeats tracked as gold dots",
      "Authorisations export to PDF for the record",
    ],
  },
  {
    id: "records",
    tag: "Patient records",
    title: "A condensed clinical file that never makes you scroll for the basics",
    body: "Demographics, allergies, active authorisations, and a unified note stream sit in one dense, legible file. Visibility follows role and practice context, so the right clinicians see the right patients — including doctors reached through their authorisation groupings.",
    points: [
      "Search by name, DOB, or phone; mandatory intake on creation",
      "Allergy values flagged in vermilion, never buried",
      "Clinic admins can merge duplicate files cleanly",
    ],
  },
  {
    id: "consent",
    tag: "Consent forms",
    title: "Seven consent templates, demographics autofilled, off-label by law",
    body: "An aesthetic history form plus six treatment consents present benefits before risks and carry a mandatory off-label clause sealed in gold. Patients sign in-app, by email, by QR, or by link; the signed form lands on the dashboard as a downloadable PDF.",
    points: [
      "Autofilled patient demographics, sealed at signing",
      "One-thumb yes/no screening, free-text where it matters",
      "In-app · email · QR · link signing channels",
    ],
  },
  {
    id: "appointments",
    tag: "Appointments & booking",
    title: "Calendar, doctor slots, and public self-booking in one timeline",
    body: "A day, week, and month calendar colours every entry by type. Doctors publish ten-minute authorisation slots; nurses book against them with an existing patient or a new lead. Patients book themselves through a shareable link and QR code, landing as awaiting-confirmation.",
    points: [
      "Auth slots, treatment windows, and ad-hoc blocks",
      "Per-user public booking link + QR code",
      "Two-way Google and Apple Calendar sync",
    ],
  },
  {
    id: "teleconsult",
    tag: "Teleconsult video",
    title: "See the patient and the file at the same time",
    body: "Authorisation reviews run as a split-screen call: live video above a scrollable clinical summary, with the request sitting in a gold-sealed box. Incoming calls ring through CallKit so a consult is never missed.",
    points: [
      "Split-screen video + live clinical density",
      "Approve or require-edit without leaving the call",
      "CallKit incoming-call ringing for VoIP consults",
    ],
  },
  {
    id: "billing",
    tag: "Billing & invoicing",
    title: "Count what's billable, then raise a clean tax invoice",
    body: "Each approved authorisation request counts as exactly one billable authorisation against the requesting nurse or clinic. Monthly statistics drill down to counterparties and individual authorisations; an A4 tax invoice with GST totals prints on demand. AestheticX counts authorisations — it does not process payments.",
    points: [
      "Monthly spreadsheet with drill-down and ad-hoc timeframes",
      "Clinic business statistics for owners",
      "A4 GST tax invoices, both parties' ABN and details",
    ],
  },
  {
    id: "notes",
    tag: "Clinical notes & aftercare",
    title: "One chronological note stream, aftercare that confirms delivery",
    body: "General and treatment notes share a single newest-first stream with titles, photo thumbnails, and file attachments. Aftercare emails assemble from treatment-category templates and report back QUEUED, DELIVERED, or FAILED so nothing goes out silently.",
    points: [
      "Unified general + treatment note stream",
      "Photo and file attachments with display-name rename",
      "Aftercare templates with a delivery send log",
    ],
  },
];

export interface ComplianceItem {
  label: string;
  body: string;
}

export const COMPLIANCE: ComplianceItem[] = [
  {
    label: "Australian data residency",
    body: "Patient avatars, note photos, signed-form PDFs, and invoices live in Firebase Storage with security rules that mirror patient visibility and short-lived signed download URLs.",
  },
  {
    label: "Server-enforced integrity",
    body: "Authorisation fan-out, repeat consumption, billing events, merges, and user creation happen only inside Cloud Function transactions. Direct client writes are blocked by Firestore rules.",
  },
  {
    label: "Account security",
    body: "First-login password set with a strength meter, and a Face-ID lock overlay that gates the interface without ending the session.",
  },
  {
    label: "Off-label by template",
    body: "Every consent form carries a mandatory, non-removable off-label clause — set apart with a gold seal, present by law of the template.",
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "Who is AestheticX for?",
    a: "Australian aesthetic-medicine practices — independent cosmetic nurses, prescribing doctors, clinic admins, and clinic owners. It supports both independent practitioners and clinic teams, with separate practice contexts for each.",
  },
  {
    q: "What platform does it run on?",
    a: "AestheticX is an iOS app, built with SwiftUI for iPhone and iPad. Patient self-booking and consent signing also work on the mobile web for your patients.",
  },
  {
    q: "Does AestheticX process payments?",
    a: "No. AestheticX counts billable authorisations and generates GST tax invoices, but it does not take or process payments. Settlement happens through your own arrangements.",
  },
  {
    q: "How does the authorisation workflow work?",
    a: "A nurse raises a request from the patient file. The prescribing doctor reviews it — often on a split-screen teleconsult — and either approves it or requires an edit. Approval issues per-medication authorisations with five repeats and a six-month expiry.",
  },
  {
    q: "Where is patient data stored?",
    a: "Binary assets are stored in Firebase Storage with Australian data residency, behind security rules that mirror patient visibility. Integrity-critical writes are enforced server-side in Cloud Functions.",
  },
  {
    q: "Is this medical or legal advice?",
    a: "No. AestheticX is practice software that supports your clinical and administrative workflow. It does not provide medical or legal advice, and it does not replace your professional judgement or obligations.",
  },
];

export interface Audience {
  key: RoleKey;
  who: string;
  line: string;
}

export const AUDIENCES: Audience[] = [
  {
    key: "rose",
    who: "Cosmetic nurses",
    line: "Raise authorisation requests, chart treatments, and book teleconsults — independently or under a clinic.",
  },
  {
    key: "umber",
    who: "Prescribing doctors",
    line: "Review and authorise from anywhere, with the patient's file live beside the call.",
  },
  {
    key: "slate",
    who: "Clinics & admins",
    line: "Run patients, appointments, merges, and authorisation-based billing across the whole team.",
  },
];
