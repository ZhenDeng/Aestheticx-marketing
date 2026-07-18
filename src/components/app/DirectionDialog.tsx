"use client";

// NSW Clause 68C direction capture + preview + PDF export. Port of iOS
// DirectionCaptureView/DirectionPreviewView (AXFeatures/FeedbackRound2ConsultViews.swift):
// capture the fields a direction needs, preview it, and export once — and only
// once — every required field is present (missingDirectionFields gates both steps).
// Like iOS, nothing here persists: the direction is assembled on demand.
import { useState } from "react";
import type { Authorisation, EmergencyAuthorisation, Patient } from "@/lib/demo/types";
import { fullName } from "@/lib/demo/types";
import { useDemoStore } from "@/lib/demo/store";
import { useDemoAuth } from "@/lib/demo/auth";
import { activePremise } from "@/lib/demo/backend";
import { RouteSelect, NeededMark } from "@/components/app/RouteSelect";
import {
  CLAUSE_68C_FIELDS,
  DEFAULT_CAPTURED_FIELDS,
  buildDirectionDraft,
  directionPrescriberName,
  directionResponsibleProvider,
  missingDirectionFields,
  premiseForCapture,
  prescriberContactForCapture,
  routeForCapture,
  type CapturedDirectionFields,
} from "@/lib/demo/direction";
import { directionPdfFilename, renderDirectionPdf } from "@/lib/demo/directionPdf";

export function DirectionDialog({ authorisation, patient, emergencies, onClose }: {
  authorisation: Authorisation;
  patient: Patient;
  emergencies: EmergencyAuthorisation[];
  onClose: () => void;
}) {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  // Capture fields prefill from data the app already holds, so the clinician doesn't retype it
  // onto a legal document. All stay editable.
  //
  // prescriberPhone / prescriberPrincipalPlace come from the stamp approveRequest writes at
  // approval, falling back to the prescriber's profile — which live resolves only when the
  // DOCTOR exports their own direction, since hydrate loads just the caller's own users doc.
  // Authorisations approved before the stamp shipped therefore behave exactly as they did.
  const [captured, setCaptured] = useState<CapturedDirectionFields>(() => {
    const actingProfile = store.profileForUser(identity?.user.id ?? "");
    // The originating request carries the line-item routes chosen at submission. Frozen once
    // approved — neither editPendingRequest nor resubmitRequest can touch an approved request's
    // items.
    const request = store.state.requests[authorisation.requestID];
    return {
      ...DEFAULT_CAPTURED_FIELDS,
      ...prescriberContactForCapture(authorisation, store.profileForUser(authorisation.doctorID)),
      premisesOfAdministration: premiseForCapture({
        stamped: authorisation.premise,
        // A clinic authorisation must print the CLINIC's premises, never the acting nurse's own.
        // They are stamped at approval because clinics/{id} is readable only to clinic members —
        // an independent cooperating doctor exporting this direction could not read them.
        clinicID: authorisation.clinicID,
        clinicPremise: authorisation.clinicPremise,
        actingPremise: activePremise(actingProfile),
      }),
      // The route was chosen per line item at request time — recover it rather than ask again.
      route: routeForCapture(authorisation.medication, request),
    };
  });
  const relationships = store.cooperationRelationships();
  const [previewing, setPreviewing] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Round 6: items carry their route; the capture field only appears for legacy
  // authorisations whose medication predates per-item routes.
  const needsRouteCapture = !authorisation.medication.route;

  const direction = buildDirectionDraft({
    directionId: authorisation.id,
    patientName: fullName(patient),
    patientAddress: patient.address,
    patientDob: patient.dateOfBirth,
    allergies: patient.allergies,
    // Names stamped on the authorisation at approval win; the cooperation directory only
    // covers authorisations approved before the stamp existed. Neither resolving ⇒ blank,
    // which missingDirectionFields gates on (never a raw uid on a legal document).
    prescriberName: directionPrescriberName(authorisation, relationships),
    responsibleProvider: directionResponsibleProvider(authorisation, relationships),
    medications: [authorisation.medication],
    expiresAt: authorisation.expiresAt,
    // Round 6: reviewedAt is the server-stamped approval instant; createdAt covers
    // authorisations approved before the stamp existed.
    approvedAt: authorisation.reviewedAt ?? authorisation.createdAt,
    // The direction is this prescriber's; reference only their emergency standing orders.
    emergencies: emergencies.filter((e) => e.doctorID === authorisation.doctorID),
    captured,
  });
  const missing = missingDirectionFields(direction);
  // Inline field marking is derived from the SAME list that gates the export, keyed by the
  // canonical CLAUSE_68C_FIELDS label each field reports under. Re-deriving emptiness per field
  // would let the marks and the gate drift apart — the one divergence this dialog cannot afford.
  const isMissing = (field: (typeof CLAUSE_68C_FIELDS)[number]) => missing.includes(field);

  function set<K extends keyof CapturedDirectionFields>(key: K, value: string) {
    setCaptured((prev) => ({ ...prev, [key]: value }));
  }

  function downloadPdf() {
    setExportError(null);
    try {
      const bytes = renderDirectionPdf(direction);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = directionPdfFilename(direction.directionId);
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revocation: some browsers start the download asynchronously from the
      // click, and revoking synchronously can abort it (0-byte download).
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError("Couldn't create the PDF");
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Clause 68C direction"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--color-ink) 45%, transparent)" }}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg text-ink">{previewing ? "Direction" : "Clause 68C direction"}</h2>
          <button type="button" onClick={onClose} className="rounded-btn border border-line px-3 py-1 text-sm text-ink-soft hover:border-tint">
            Done
          </button>
        </div>

        {!previewing ? (
          <div className="mt-4 flex flex-col gap-3">
            {/* A blank field here is a PROMPT, not a defect: the values below could not be
                resolved from the record (a nurse cannot read the prescriber's profile, and
                authorisations approved before the stamps shipped carry neither the contact nor a
                per-item route). Saying so once, up front, frames every mark beneath it. */}
            {missing.length > 0 && (
              <p id={MISSING_EXPLANATION_ID} data-testid="direction-missing-explanation"
                className="rounded-inner px-3 py-2 text-xs text-ink-soft" style={{ background: "var(--color-danger-soft)" }}>
                Some fields couldn&apos;t be filled in from this authorisation&apos;s record. Complete the
                ones marked <span style={{ color: "var(--color-danger)" }}>Needed</span> to preview and export.
              </p>
            )}

            <p className="micro">Prescriber</p>
            <Field label="Phone" required={isMissing("Prescriber phone")} value={captured.prescriberPhone} onChange={(v) => set("prescriberPhone", v)} />
            <Field label="Principal place of practice" required={isMissing("Principal place of practice")} value={captured.prescriberPrincipalPlace} onChange={(v) => set("prescriberPrincipalPlace", v)} />

            <p className="micro mt-2">Administration</p>
            <Field label="Premises of administration" required={isMissing("Premises of administration")} value={captured.premisesOfAdministration} onChange={(v) => set("premisesOfAdministration", v)} />
            {needsRouteCapture && (
              // Constrained to the five legal routes — the same control the request form uses.
              // A direction must never print a route somebody typed by hand.
              <RouteSelect label="Route (applies to all)" className="w-full" value={captured.route}
                onChange={(v) => set("route", v)}
                invalid={isMissing("Route")} describedBy={missing.length > 0 ? MISSING_EXPLANATION_ID : undefined} />
            )}
            <Field label="Number & intervals" required={isMissing("Number and intervals of administration")} value={captured.administrationCountAndIntervals} onChange={(v) => set("administrationCountAndIntervals", v)} />

            <p className="micro mt-2">Direction</p>
            {/* Round 6: the reviewed date is always the approval day — shown, not captured. */}
            <p className="text-sm text-ink">Patient reviewed: <span className="text-ink-soft">{direction.patientReviewedISO}</span></p>
            <Field label="Period direction has effect" required={isMissing("Period direction has effect")} value={captured.directionPeriod} onChange={(v) => set("directionPeriod", v)} />

            {missing.length === 0 ? (
              <button type="button" onClick={() => setPreviewing(true)}
                className="mt-2 w-full rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                Preview direction
              </button>
            ) : (
              <p className="mt-2 text-xs" style={{ color: "var(--color-danger)" }}>
                Still needed: {missing.join(", ")}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <button type="button" onClick={() => setPreviewing(false)} className="text-sm text-ink-soft hover:text-ink">
              ← Back to capture
            </button>

            <p className="micro mt-3" style={{ color: "var(--color-tint)" }}>DIRECTION TO ADMINISTER · NSW CL. 68C</p>
            <p className="mt-1 font-display text-2xl text-ink">Treatment direction</p>

            <dl className="mt-3 rounded-inner border border-line">
              <Row label="Patient" value={direction.patientName} />
              <Row label="Date of birth" value={direction.patientDateOfBirth} />
              <Row label="Allergies" value={direction.patientAllergies} />
              <Row label="Patient address" value={direction.patientAddress} />
              <Row label="Prescriber" value={`${direction.prescriberName} · ${direction.prescriberPhone}`} />
              <Row label="Principal place of practice" value={direction.prescriberPrincipalPlace} />
              <Row label="Premises of administration" value={direction.premisesOfAdministration} />
              <Row label="Responsible provider" value={direction.responsibleProvider} />
              <Row label="Authorisation status" value={direction.authorisationStatus} />
              <Row label="Authorisation expires" value={direction.authorisationExpires} />
              <Row label="Patient reviewed" value={direction.patientReviewedISO} />
              <Row label="Direction effective" value={direction.directionPeriod} />
              <Row label="Administrations" value={direction.administrationCountAndIntervals} />
            </dl>

            <p className="micro mt-4">Per administration — to record</p>
            <ul className="mt-1 rounded-inner border border-line px-4">
              {direction.administrations.map((a, i) => (
                // Index key is safe: render-only list derived from the authorisation.
                <li key={i} className="py-2">
                  <p className="text-sm font-medium text-ink">{a.substanceAndForm}</p>
                  <p className="text-xs text-ink-soft">{a.category} · {a.bodySite} · {a.route} · {a.quantity}</p>
                </li>
              ))}
            </ul>

            <p className="micro mt-4">Emergency standing authorisations</p>
            {direction.emergencyAuthorisations.length === 0 ? (
              <p className="mt-1 text-sm text-ink-soft">None on file.</p>
            ) : (
              <ul className="mt-1 rounded-inner border border-line px-4">
                {direction.emergencyAuthorisations.map((e) => (
                  <li key={e.label} className="py-2">
                    <p className="text-sm font-medium text-ink">{e.label}</p>
                    <p className="text-xs text-ink-soft">{e.detail}</p>
                  </li>
                ))}
              </ul>
            )}

            <p className="micro mt-4">Prescriber authorisation</p>
            <div className="mt-1 rounded-inner border border-line px-4 py-2">
              <p className="text-sm text-ink">{direction.prescriberAttestation}</p>
              <p className="micro text-ink-soft">{direction.authorisationStatus} · Authorisation {direction.directionId}</p>
            </div>

            {missing.length === 0 ? (
              <button type="button" onClick={downloadPdf}
                className="mt-4 w-full rounded-btn px-4 py-2 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
                Download direction (PDF)
              </button>
            ) : (
              <div className="mt-4 rounded-inner px-4 py-3" style={{ background: "var(--color-danger-soft)" }}>
                <p className="micro" style={{ color: "var(--color-danger)" }}>Complete before export</p>
                {missing.map((m) => (
                  <p key={m} className="mt-1 text-xs" style={{ color: "var(--color-danger)" }}>· {m}</p>
                ))}
              </div>
            )}
            {exportError && <p className="mt-2 text-xs" style={{ color: "var(--color-danger)" }}>{exportError}</p>}

            <p className="mt-3 text-xs text-ink-faint">Wording pending practitioner/legal sign-off before clinical use.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ties every marked control to the one explanation of why it came up empty. */
const MISSING_EXPLANATION_ID = "direction-missing-explanation";

function Field({ label, value, onChange, required = false }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Reported by missingDirectionFields — marks the control, never blocks typing into it. */
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="micro">
        {label}
        {required && <NeededMark />}
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        aria-invalid={required} aria-describedby={required ? MISSING_EXPLANATION_ID : undefined}
        className="mt-1 w-full rounded-field border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-tint"
        style={{ borderColor: required ? "var(--color-danger)" : "var(--color-line)" }} />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line px-4 py-2 last:border-b-0">
      <dt className="micro">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value.trim() === "" ? "—" : value}</dd>
    </div>
  );
}
