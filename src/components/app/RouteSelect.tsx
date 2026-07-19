"use client";

// The Clause 68C route-of-administration selector, shared by the two surfaces that capture one:
// the request form (per line item, at submission) and the direction capture dialog (the legacy
// fallback for authorisations that predate per-item routes).
//
// Shared deliberately rather than duplicated. Route is a five-value legal enumeration printed
// onto a direction, and two copies of that list — or two copies of the rule that it is NEVER
// pre-chosen — would eventually disagree. One control, one option list, one rule.
import { ROUTES_OF_ADMINISTRATION, ROUTE_DISPLAY_LABELS } from "@/lib/demo/types";

export function RouteSelect({ value, onChange, label = "Route of administration", className = "w-48", invalid = false, describedBy }: {
  value: string | undefined;
  onChange: (route: string) => void;
  /** Also the control's accessible name — the two surfaces word it differently. */
  label?: string;
  /** The request form sits in an inline row; the capture dialog in a full-width field stack. */
  className?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <label className="block">
      <span className="micro">
        {label}
        {invalid && <NeededMark />}
      </span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={label}
        aria-invalid={invalid} aria-describedby={describedBy}
        className={`mt-1 rounded-field border bg-card px-3 py-1.5 text-sm text-ink ${className}`}
        style={{ borderColor: invalid ? "var(--color-danger)" : "var(--color-line)" }}>
        {/* Never pre-chosen: the clinician must actively pick a route (iOS LineItemEditorView). */}
        <option value="" disabled>Select route…</option>
        {/* A select handed a value matching no option silently selects its first ENABLED option,
            so an out-of-enum stored value would DISPLAY as a different route than the one held —
            and the caller would never know. Route is a loose `string` end to end and live values
            come from a Cloud Function whose scheme this repo does not control, so surface such a
            value as itself rather than let the control quietly substitute one of the five.
            routeForCapture already refuses these upstream; this is the backstop for every other
            caller, the request form included. */}
        {value && !(ROUTES_OF_ADMINISTRATION as readonly string[]).includes(value) && (
          <option value={value}>{value} (not a recognised route)</option>
        )}
        {ROUTES_OF_ADMINISTRATION.map((r) => (
          <option key={r} value={r}>{ROUTE_DISPLAY_LABELS[r]}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * The affordance marking a required field the app could not resolve. Carries the WORD, not just
 * the colour: this repo's axe run has the color-contrast rule enabled and a mark that only a
 * sighted, colour-perceiving reader can see is not a mark. "Needed" matches the wording of the
 * summary line at the foot of the form, so the two read as one signal.
 */
export function NeededMark() {
  return <span className="ml-1.5" style={{ color: "var(--color-danger)" }}>· Needed</span>;
}
