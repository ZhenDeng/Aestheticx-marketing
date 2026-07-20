"use client";

import { useEffect, useMemo, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { effectiveRelationshipKinds, RELATIONSHIP_KINDS, type AccountRecord, type CooperationRelationship, type CounterpartyType, type Identity, type RelationshipKind } from "@/lib/demo/types";
import type { ClinicOption, SetCooperationRelationshipInput } from "@/lib/demo/backend";

// Cooperation relationships (spec 2026-07-08 cooperation-relationships, constitution §17):
// gates which doctors a nurse/clinic may request authorisation from, and carries the
// per-relationship price override + invoice-applies flag. Writes are demo-writable (the
// store validates + applies eagerly, then best-effort mirrors live), so this section renders
// identically in both modes.
export function CooperationRelationshipsSection() {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  const [creating, setCreating] = useState(false);
  // The full doctor directory, fetched once for the create form's picker (accounts() already
  // gives nurses synchronously; doctors need the async directory like the request builder did).
  const [doctorOptions, setDoctorOptions] = useState<{ doctorId: string; doctorName: string }[]>([]);
  const [doctorsLoaded, setDoctorsLoaded] = useState(false);
  useEffect(() => {
    if (doctorsLoaded) return;
    let cancelled = false;
    store.listDoctors().then((ds) => { if (!cancelled) { setDoctorOptions(ds); setDoctorsLoaded(true); } });
    return () => { cancelled = true; };
  }, [store, doctorsLoaded]);

  const relationships = store.cooperationRelationships();
  const nurses = store.accounts().filter((a) => a.roles.includes("nurse"));
  const clinics = store.clinics();

  // Group by doctor, preserving cooperationRelationships()'s sort (doctor name, then
  // counterparty name) since Map insertion order follows first-seen iteration order.
  const groups = useMemo(() => {
    const byDoctor = new Map<string, { doctorID: string; doctorName: string; rels: CooperationRelationship[] }>();
    for (const r of relationships) {
      const g = byDoctor.get(r.doctorID) ?? { doctorID: r.doctorID, doctorName: r.doctorName, rels: [] };
      g.rels.push(r);
      byDoctor.set(r.doctorID, g);
    }
    return [...byDoctor.values()];
  }, [relationships]);

  if (!identity) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-lg text-ink">Cooperation relationships</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Controls which doctors a nurse or clinic may request authorisation from, plus each
        relationship&apos;s pricing and invoicing.
      </p>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No cooperation relationships yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.doctorID} className="rounded-card border border-line bg-card shadow-card">
              <h3 className="border-b border-line px-4 py-2.5 font-display text-base text-ink">{g.doctorName}</h3>
              <ul>
                {g.rels.map((r) => <RelationshipRow key={r.id} rel={r} identity={identity} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {creating ? (
        <CreateRelationshipForm
          doctorOptions={doctorOptions}
          nurses={nurses}
          clinics={clinics}
          identity={identity}
          onDone={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-4 w-full rounded-btn border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-tint/50"
        >
          Add cooperation relationship
        </button>
      )}
    </section>
  );
}

function RelationshipRow({ rel, identity }: { rel: CooperationRelationship; identity: Identity }) {
  const store = useDemoStore();
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const priceText = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
  const [priceDraft, setPriceDraft] = useState(priceText(rel.priceCentsOverride));
  const priceDirty = priceDraft.trim() !== priceText(rel.priceCentsOverride);

  function patch(fields: Partial<SetCooperationRelationshipInput>) {
    setError(null);
    try {
      store.setCooperationRelationship(
        {
          doctorID: rel.doctorID,
          doctorName: rel.doctorName,
          counterpartyType: rel.counterpartyType,
          counterpartyID: rel.counterpartyID,
          counterpartyName: rel.counterpartyName,
          // Effective, not stored: a pre-kind clinic doc behaves as ["employee"], so an edit
          // must persist that same set rather than dropping the field (nurse rows: null → omitted).
          relationshipKinds: effectiveRelationshipKinds(rel) ?? undefined,
          status: rel.status,
          authRequestsAllowed: rel.authRequestsAllowed,
          invoiceApplies: rel.invoiceApplies,
          priceCentsOverride: rel.priceCentsOverride,
          ...fields,
        },
        identity,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function savePrice() {
    const trimmed = priceDraft.trim();
    if (!trimmed) { patch({ priceCentsOverride: null }); return; }
    const dollars = Number(trimmed);
    if (!Number.isFinite(dollars) || dollars <= 0) { setError("Enter a valid price."); return; }
    patch({ priceCentsOverride: Math.round(dollars * 100) });
  }

  function remove() {
    setError(null);
    try { store.removeCooperationRelationship(rel.id, identity); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setConfirmingRemove(false);
  }

  const priceLabel = rel.priceCentsOverride == null ? "default $25.00" : `$${(rel.priceCentsOverride / 100).toFixed(2)}`;
  const history = showHistory ? store.relationshipAuditFor(rel.id) : [];
  const kinds = effectiveRelationshipKinds(rel);

  return (
    <li className="flex flex-col gap-2.5 border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{rel.counterpartyName}</span>
          <span className="micro block">
            {kinds ? `Clinic · ${kinds.join(" + ")}` : "Nurse"} · {priceLabel} · invoicing {rel.invoiceApplies ? "on" : "off"}
          </span>
        </span>
        <span
          className="micro flex-none rounded-full px-2 py-0.5"
          style={rel.status === "active"
            ? { background: "var(--color-umber-soft)", color: "var(--color-umber)" }
            : { background: "var(--color-line)", color: "var(--color-ink-soft)" }}
        >
          {rel.status === "active" ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-ink">
        {kinds && (
          // Employee/Prescriber kind-set chips (19/07 feedback): each chip toggles that kind
          // in the set — deselecting Employee revokes the clinic membership this relationship
          // granted (never an independent grant), selecting it grants one. At least one kind
          // must stay selected, so the last chip is a no-op. Audit history records each change.
          <span className="flex items-center gap-1.5">
            <span className="micro">Kind</span>
            {RELATIONSHIP_KINDS.map((value) => {
              const selected = kinds.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    const next = selected ? kinds.filter((k) => k !== value) : [...kinds, value];
                    if (next.length > 0) patch({ relationshipKinds: RELATIONSHIP_KINDS.filter((k) => next.includes(k)) });
                  }}
                  aria-pressed={selected}
                  className={`micro rounded-btn px-2 py-1 ${selected ? "text-card" : "border border-line text-ink-soft"}`}
                  style={selected ? { background: "var(--color-tint)" } : undefined}
                >
                  {value === "employee" ? "Employee" : "Prescriber"}
                </button>
              );
            })}
          </span>
        )}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={rel.status === "active"} onChange={(e) => patch({ status: e.target.checked ? "active" : "inactive" })} />
          Active
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={rel.authRequestsAllowed} onChange={(e) => patch({ authRequestsAllowed: e.target.checked })} />
          Requests allowed
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={rel.invoiceApplies} onChange={(e) => patch({ invoiceApplies: e.target.checked })} />
          Invoicing
        </label>
        <label className="flex items-center gap-1.5">
          <span className="micro">Price $</span>
          <input
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            placeholder="25.00"
            inputMode="decimal"
            className="w-20 rounded-field border border-line bg-card px-2 py-1 text-sm text-ink"
          />
          {priceDirty && (
            <button onClick={savePrice} className="micro rounded-btn px-2 py-1 text-card" style={{ background: "var(--color-tint)" }}>
              Save
            </button>
          )}
        </label>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setShowHistory((s) => !s)} className="micro text-ink-soft hover:text-ink">
          {showHistory ? "Hide history" : "Show history"}
        </button>
        {confirmingRemove ? (
          <span className="flex items-center gap-2">
            <span className="micro" style={{ color: "var(--color-rose)" }}>Deactivate this relationship?</span>
            <button onClick={remove} className="micro rounded-btn px-2.5 py-1 text-card" style={{ background: "var(--color-rose)" }}>
              Confirm
            </button>
            <button onClick={() => setConfirmingRemove(false)} className="micro rounded-btn border border-line px-2.5 py-1 text-ink-soft">
              Cancel
            </button>
          </span>
        ) : rel.status === "active" && (
          <button
            onClick={() => setConfirmingRemove(true)}
            className="micro rounded-btn border px-2.5 py-1 hover:opacity-80"
            style={{ borderColor: "var(--color-rose)", color: "var(--color-rose)" }}
          >
            Remove
          </button>
        )}
      </div>

      {showHistory && (
        <ul className="flex flex-col gap-1 rounded-inner border border-line px-3 py-2" style={{ background: "var(--color-tint-soft)" }}>
          {history.length === 0 && <li className="micro text-ink-soft">No history yet.</li>}
          {history.map((entry) => (
            <li key={entry.id} className="micro text-ink-soft">
              <span className="font-medium text-ink">{entry.action}</span> · {entry.summary} · {new Date(entry.at).toLocaleString()} · {entry.actorName}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Inline create form: doctor picker + a Nurse/Clinic counterparty toggle (spec:
// cooperation-linking — the callable, rules and edit rows always took clinic
// counterparties; only this create path was nurse-only), an optional price override,
// and sensible active defaults (authRequestsAllowed + invoiceApplies on) matching what
// a super admin would set up first.
function CreateRelationshipForm({ doctorOptions, nurses, clinics, identity, onDone, onCancel }: {
  doctorOptions: { doctorId: string; doctorName: string }[];
  nurses: AccountRecord[];
  clinics: ClinicOption[];
  identity: Identity;
  onDone: () => void;
  onCancel: () => void;
}) {
  const store = useDemoStore();
  const [doctorID, setDoctorID] = useState(doctorOptions[0]?.doctorId ?? "");
  const [counterpartyType, setCounterpartyType] = useState<CounterpartyType>("nurse");
  const [counterpartyID, setCounterpartyID] = useState(nurses[0]?.id ?? "");
  // Clinic-only relationship kind set (19/07 feedback) — a doctor can be employee,
  // prescriber, or both, but never neither. Employee is the default: it matches every
  // pre-kind relationship's behaviour (membership + clinic identity).
  const [relationshipKinds, setRelationshipKinds] = useState<RelationshipKind[]>(["employee"]);
  const [priceDollars, setPriceDollars] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (doctorOptions.length === 0) {
    return (
      <section className="mt-4 rounded-card border border-line bg-card px-5 py-4 shadow-card">
        <p className="text-sm text-ink-soft">No doctors in the directory yet.</p>
        <div className="mt-3 flex justify-end">
          <button onClick={onCancel} className="rounded-btn border border-line px-4 py-1.5 text-sm text-ink-soft hover:border-tint/50">Close</button>
        </div>
      </section>
    );
  }

  // The selected type's directory as uniform {id, label} options; empty ⇒ the picker cell
  // explains and Create disables, while the toggle stays usable to switch type.
  const options: ClinicOption[] = counterpartyType === "nurse"
    ? nurses.map((n) => ({ id: n.id, label: n.name || n.email || n.id }))
    : clinics;

  // Effective selections resolve against the CURRENT option lists, not the state captured
  // at mount — directories load/refresh async, and a select rendering option A while state
  // holds a stale "" or removed id is the select-substitution trap (18/07 defect class).
  const effectiveDoctorID = doctorOptions.some((d) => d.doctorId === doctorID) ? doctorID : (doctorOptions[0]?.doctorId ?? "");
  const effectiveCounterpartyID = options.some((o) => o.id === counterpartyID) ? counterpartyID : (options[0]?.id ?? "");

  function selectType(type: CounterpartyType) {
    setCounterpartyType(type);
    setError(null);
    setCounterpartyID((type === "nurse" ? nurses[0]?.id : clinics[0]?.id) ?? "");
  }

  function submit() {
    setError(null);
    const doctor = doctorOptions.find((d) => d.doctorId === effectiveDoctorID);
    const counterparty = options.find((o) => o.id === effectiveCounterpartyID);
    if (!doctor || !counterparty) { setError(`Pick a doctor and a ${counterpartyType}.`); return; }
    // A clinic with a blank name is listed but not linkable: submitting would freeze the
    // synthetic "Unnamed clinic (…)" label into the stored relationship's counterpartyName
    // (the Clause 68C party-name staleness class — durable records never carry placeholders).
    if (counterparty.unnamed) {
      setError("This clinic has no name yet — set the clinic's name before linking it.");
      return;
    }
    // setCooperationRelationship is an UPSERT on the deterministic doctor+counterparty id:
    // "creating" an existing pair would silently reactivate a removed relationship and
    // overwrite its negotiated price/invoicing flags. Send the admin to the edit row instead.
    const existing = store.cooperationRelationships().find((r) =>
      r.doctorID === doctor.doctorId && r.counterpartyType === counterpartyType && r.counterpartyID === counterparty.id);
    if (existing) {
      setError(`${doctor.doctorName} and ${counterparty.label} already have a relationship${existing.status === "inactive" ? " (currently removed)" : ""} — edit it in the list above.`);
      return;
    }
    let priceCentsOverride: number | null = null;
    const trimmed = priceDollars.trim();
    if (trimmed) {
      const dollars = Number(trimmed);
      if (!Number.isFinite(dollars) || dollars <= 0) { setError("Enter a valid price."); return; }
      priceCentsOverride = Math.round(dollars * 100);
    }
    setSubmitting(true);
    try {
      store.setCooperationRelationship(
        {
          doctorID: doctor.doctorId,
          doctorName: doctor.doctorName,
          counterpartyType,
          counterpartyID: counterparty.id,
          counterpartyName: counterparty.label,
          relationshipKinds: counterpartyType === "clinic" ? relationshipKinds : undefined,
          status: "active",
          authRequestsAllowed: true,
          invoiceApplies: true,
          priceCentsOverride,
        },
        identity,
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-4 rounded-card border border-line bg-card px-5 py-4 shadow-card">
      <h3 className="font-display text-base text-ink">New cooperation relationship</h3>
      <div className="mt-3 flex gap-1.5">
        {([["nurse", "Nurse"], ["clinic", "Clinic"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => selectType(value)}
            aria-pressed={counterpartyType === value}
            className={`rounded-btn px-3 py-1.5 text-sm ${counterpartyType === value ? "text-card" : "border border-line text-ink-soft"}`}
            style={counterpartyType === value ? { background: "var(--color-tint)" } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      {counterpartyType === "clinic" && (
        <div className="mt-3">
          <span className="micro">Relationship kind — pick one or both</span>
          <div className="mt-1 flex gap-1.5">
            {([["employee", "Employee"], ["prescriber", "Prescriber"]] as const).map(([value, label]) => {
              const selected = relationshipKinds.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRelationshipKinds((kinds) => {
                    const next = kinds.includes(value) ? kinds.filter((k) => k !== value) : [...kinds, value];
                    // Never let the set go empty — a clinic relationship must be at least one kind.
                    return next.length > 0 ? RELATIONSHIP_KINDS.filter((k) => next.includes(k)) : kinds;
                  })}
                  aria-pressed={selected}
                  className={`rounded-btn px-3 py-1.5 text-sm ${selected ? "text-card" : "border border-line text-ink-soft"}`}
                  style={selected ? { background: "var(--color-tint)" } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="micro mt-1 text-ink-soft">
            Employee — works at the clinic and gains a clinic identity under “Practise as”.
            Prescriber — authorises for the clinic externally, no clinic identity.
          </p>
        </div>
      )}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="micro">Doctor</span>
          <select value={effectiveDoctorID} onChange={(e) => setDoctorID(e.target.value)}
            className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink">
            {doctorOptions.map((d) => <option key={d.doctorId} value={d.doctorId}>{d.doctorName}</option>)}
          </select>
        </label>
        {options.length === 0 ? (
          <p className="self-end pb-1.5 text-sm text-ink-soft">
            {counterpartyType === "nurse"
              ? "No nurse accounts yet."
              : "No clinic accounts yet — create a clinic account first."}
          </p>
        ) : (
          <label className="block">
            <span className="micro">{counterpartyType === "nurse" ? "Nurse" : "Clinic"}</span>
            <select value={effectiveCounterpartyID} onChange={(e) => setCounterpartyID(e.target.value)}
              className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink">
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="micro">Price override (optional)</span>
          <input
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            placeholder="Leave blank for default $25.00"
            inputMode="decimal"
            className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink"
          />
        </label>
      </div>
      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <div className="mt-4 flex justify-end gap-2.5">
        <button onClick={onCancel} disabled={submitting} className="rounded-btn border border-line px-4 py-1.5 text-sm text-ink-soft hover:border-tint/50">
          Cancel
        </button>
        <button onClick={submit} disabled={submitting || options.length === 0} className="rounded-btn px-4 py-1.5 text-sm font-medium text-card disabled:opacity-60" style={{ background: "var(--color-tint)" }}>
          {submitting ? "Creating…" : "Create relationship"}
        </button>
      </div>
    </section>
  );
}
