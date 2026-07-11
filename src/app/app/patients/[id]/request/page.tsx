"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import { doctorRequestStats, rankDoctors, mostRecentlyRequestedDoctor } from "@/lib/demo/doctorRanking";
import type { MedicationItem, ProductCategory } from "@/lib/demo/types";
import {
  categoryDisplayName, productsInCategory, brandsInCategory, productsInBrand,
  searchProducts, productLabel, treatmentAreasFor, quantityCaption, unitSuffix, type CatalogProduct,
} from "@/lib/demo/catalog";
import {
  loadRecentlyUsed, recordRecentlyUsedProduct, resolveRecentlyUsed,
  composeOtherDosage, splitCustomAreas,
} from "@/lib/demo/requestBuilder";

const CATEGORIES: ProductCategory[] = ["neurotoxin", "haFiller", "skinBooster", "collagenStimulator", "prpPrf"];

type Line = { key: string; item: MedicationItem };

function itemFromProduct(p: CatalogProduct): MedicationItem {
  return { name: p.name, dosage: "", category: p.category, brand: p.brand, unit: p.unit, areas: [] };
}

// iOS "Other / compounded medication": MedicationItem(name: "", dosage: "", category: .other)
// — Swift init defaults unit to .freeText.
function emptyOtherItem(): MedicationItem {
  return { name: "", dosage: "", category: "other", unit: "freeText", areas: [] };
}

// Free-text editor for the "other" category — port of iOS LineItemEditorView's
// isOther branch: name / dosage / route of administration / treatment area, no timing.
// Route folds into dosage as "dose · route"; areas come from the comma-split area text.
function OtherLineEditor({ line, onChange, onRemove }: {
  line: Line;
  onChange: (item: MedicationItem) => void;
  onRemove: () => void;
}) {
  const { item } = line;
  const [dose, setDose] = useState(item.dosage);
  const [route, setRoute] = useState("");
  const [areaText, setAreaText] = useState(item.areas.join(", "));

  function update(next: { dose?: string; route?: string; areaText?: string }) {
    const d = next.dose ?? dose;
    const r = next.route ?? route;
    const a = next.areaText ?? areaText;
    if (next.dose !== undefined) setDose(next.dose);
    if (next.route !== undefined) setRoute(next.route);
    if (next.areaText !== undefined) setAreaText(next.areaText);
    onChange({ ...item, dosage: composeOtherDosage(d, r), areas: splitCustomAreas(a) });
  }

  return (
    <div className="rounded-inner border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">Other / compounded medication</p>
        <button type="button" onClick={onRemove} className="text-sm text-ink-soft hover:text-ink">Remove</button>
      </div>
      <label className="mt-3 block">
        <span className="micro">Medication name</span>
        <input value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })}
          className="mt-1 w-full rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
      </label>
      {/* Spec 2026-07-08: classify a manual/compounded product as an HA filler so it triggers
          the Hyaluronidase emergency authorisation on approval (Rule 5 / §15). */}
      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={item.category === "haFiller"}
          onChange={(e) => onChange({ ...item, category: e.target.checked ? "haFiller" : "other" })}
        />
        This is an HA (hyaluronic acid) filler
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <label className="block">
          <span className="micro">Dosage</span>
          <input value={dose} onChange={(e) => update({ dose: e.target.value })}
            className="mt-1 w-40 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
        </label>
        <label className="block">
          <span className="micro">Route of administration</span>
          <input value={route} onChange={(e) => update({ route: e.target.value })}
            placeholder="e.g. topical" className="mt-1 w-48 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="micro">Treatment area</span>
        <input value={areaText} onChange={(e) => update({ areaText: e.target.value })}
          placeholder="Type a custom area" className="mt-1 w-full rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
      </label>
    </div>
  );
}

function LineEditor({ line, onChange, onRemove }: {
  line: Line;
  onChange: (item: MedicationItem) => void;
  onRemove: () => void;
}) {
  const { item } = line;
  const [customArea, setCustomArea] = useState("");
  const areas = treatmentAreasFor(item.category, item.unit);
  const customAreas = item.areas.filter((a) => !areas.includes(a));

  function toggleArea(a: string) {
    onChange({ ...item, areas: item.areas.includes(a) ? item.areas.filter((x) => x !== a) : [...item.areas, a] });
  }
  function addCustom() {
    const a = customArea.trim();
    if (a && !item.areas.includes(a)) onChange({ ...item, areas: [...item.areas, a] });
    setCustomArea("");
  }

  return (
    <div className="rounded-inner border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{item.brand ? `${item.brand} · ${item.name}` : item.name}</p>
        <button type="button" onClick={onRemove} className="text-sm text-ink-soft hover:text-ink">Remove</button>
      </div>
      <label className="mt-3 block">
        <span className="micro">{quantityCaption(item.unit)}{unitSuffix(item.unit) ? ` (${unitSuffix(item.unit)})` : ""}</span>
        <input value={item.dosage} onChange={(e) => onChange({ ...item, dosage: e.target.value })} inputMode="decimal"
          className="mt-1 w-32 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
      </label>
      <div className="mt-3">
        <span className="micro">Treatment areas</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {areas.map((a) => {
            const on = item.areas.includes(a);
            return (
              <button key={a} type="button" onClick={() => toggleArea(a)}
                className={`rounded-btn px-2.5 py-1 text-xs ${on ? "text-card" : "border border-line text-ink-soft"}`}
                style={on ? { background: "var(--color-tint)" } : undefined}>{a}</button>
            );
          })}
          {customAreas.map((a) => (
            <button key={a} type="button" onClick={() => toggleArea(a)} className="rounded-btn px-2.5 py-1 text-xs text-card" style={{ background: "var(--color-tint)" }}>
              {a} ✕
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={customArea} onChange={(e) => setCustomArea(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Add another area" className="w-48 rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
          <button type="button" onClick={addCustom} className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">Add</button>
        </div>
      </div>
      <label className="mt-3 block">
        <span className="micro">Timing (optional)</span>
        <input value={item.timing ?? ""} onChange={(e) => onChange({ ...item, timing: e.target.value || undefined })}
          placeholder="e.g. PRN monthly" className="mt-1 w-full rounded-field border border-line bg-card px-3 py-1.5 text-sm text-ink" />
      </label>
    </div>
  );
}

export default function RequestBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  // Edit mode: ?edit={requestId} reuses this builder to amend a doctor-returned
  // (needsEdit) request. Only the items change on resubmit — the addressed doctor is
  // fixed (Firestore rules permit items + status only), so its picker is locked.
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const editRequest = editId ? store.state.requests[editId] : undefined;
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const [category, setCategory] = useState<ProductCategory>("neurotoxin");
  const [brand, setBrand] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [doctorId, setDoctorId] = useState<string>("");
  // iOS ProductPickerView loads recently-used onAppear (device-local store).
  // loadRecentlyUsed is SSR-guarded (returns [] without window), so a lazy
  // initializer is safe and avoids an effect + extra render.
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentlyUsed());

  // Cooperation-relationship gate (spec 2026-07-08): the doctors the acting nurse/clinic may
  // request authorisation from — a sync selector over hydrated state (works in demo + live),
  // so no fetch/loading state is needed. `identity` is still null on the very first render
  // (before the `!identity` guard below runs), so fall back to an empty gate then.
  const cooperating = useMemo(
    () => (identity ? store.cooperatingDoctors(identity) : []),
    [store, identity],
  );

  // Prefill the builder from the returned request the first time it hydrates. Derived in
  // render (not an effect) so the locked doctor never flashes a wrong value before commit;
  // `prefilledFor` guards against re-seeding on later store re-renders, which would clobber
  // the nurse's in-progress edits. Deterministic keys keep the render pure.
  if (editRequest && prefilledFor !== editRequest.id) {
    setPrefilledFor(editRequest.id);
    setLines(editRequest.items.map((item, i) => ({ key: `edit-${editRequest.id}-${i}`, item })));
    setDoctorId(editRequest.doctorID);
  }

  // Rank by the nurse's own request history: most-requested first, then most-recent, then
  // name. Default to the doctor they last requested. Recompute when either input changes.
  const stats = useMemo(
    () => doctorRequestStats(Object.values(store.state.requests), identity?.user.id ?? ""),
    [store.state.requests, identity?.user.id],
  );
  const doctors = useMemo(
    () => rankDoctors(cooperating, stats).map((d) => ({ id: d.doctorId, name: d.doctorName })),
    [cooperating, stats],
  );

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canView) {
    return <p className="text-ink-soft">This patient is not in your view.</p>;
  }
  if (identity.role !== "nurse") {
    return <p className="text-ink-soft">Only a nurse can raise an authorisation request.</p>;
  }
  // Once loaded, an edit target must exist, belong to this nurse, and still be editable: a
  // doctor-returned request (needsEdit → resubmit) OR an untouched pending one (edit in place,
  // Tier 3 #7). Any other status ("no longer editable") means the doctor has acted.
  const editableTarget =
    !!editRequest && editRequest.nurse.id === identity.user.id &&
    (editRequest.status === "needsEdit" || editRequest.status === "pending");
  if (editId && !editableTarget) {
    return (
      <div className="max-w-3xl">
        <Link href={`/app/patients/${id}`} className="text-sm text-ink-soft hover:text-ink">← Back to patient</Link>
        <p className="mt-4 text-ink-soft">This request can no longer be edited.</p>
      </div>
    );
  }
  const editing = !!editId;
  // A pending edit is items-only and keeps the request pending; a needsEdit edit resubmits it.
  const editingPending = editing && editRequest?.status === "pending";
  const me = identity;

  // Default to the last-requested doctor, else the patient's prescribing doctor, else the
  // top-ranked (most-requested) doctor. A live in-session pick overrides via doctorId.
  const lastRequested = mostRecentlyRequestedDoctor(stats, doctors.map((d) => d.id));
  const defaultDoctor = lastRequested
    ?? patient.prescribingDoctorIDs.find((d) => doctors.some((x) => x.id === d))
    ?? doctors[0]?.id ?? "";
  const chosenDoctor = doctorId || defaultDoctor;
  const brands = brandsInCategory(category);
  const results = query.trim() ? searchProducts(query) : [];
  const recent = resolveRecentlyUsed(recentIds);

  function addProduct(p: CatalogProduct) {
    // iOS records at pick time (ProductPickerView.pick), not on submit.
    setRecentIds(recordRecentlyUsedProduct(p.id));
    setLines((ls) => [...ls, { key: crypto.randomUUID(), item: itemFromProduct(p) }]);
  }
  function addOther() {
    // iOS's "Other / compounded medication" bypasses the recently-used store.
    setLines((ls) => [...ls, { key: crypto.randomUUID(), item: emptyOtherItem() }]);
  }
  function updateLine(key: string, item: MedicationItem) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, item } : l)));
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  // iOS drops nameless items at submit and blocks on missing dosage; the web keeps
  // it stricter-but-simpler: every line must have a name and a dosage.
  const canSubmit = lines.length > 0
    && lines.every((l) => l.item.name.trim() && l.item.dosage.trim())
    && !!chosenDoctor;

  function submit() {
    if (!canSubmit) return;
    const items = lines.map((l) => l.item);
    if (editing && editRequest) {
      // Pending → edit in place (status stays pending); needsEdit → resubmit (re-opens review).
      if (editRequest.status === "pending") {
        store.editPendingRequest({ requestID: editRequest.id, items, identity: me });
      } else {
        store.resubmitRequest({ requestID: editRequest.id, items, identity: me });
      }
    } else {
      store.submitRequest({ patientID: id, doctorID: chosenDoctor, items, identity: me });
    }
    router.push(`/app/patients/${id}`);
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/app/patients/${id}`} className="text-sm text-ink-soft hover:text-ink">← Back to patient</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">{editing ? "Edit authorisation request" : "Raise authorisation request"}</h1>
      {editing && (
        <p className="mt-1 text-sm text-ink-soft">
          {editingPending
            ? "Update the items before the doctor reviews this request."
            : "The doctor asked for a change. Update the items and resubmit for review."}
        </p>
      )}

      <h2 className="mt-6 font-display text-xl text-ink">Add products</h2>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all products…"
        className="mt-3 w-full rounded-field border border-line bg-card px-3 py-2 text-sm text-ink" />

      {query.trim() ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => addProduct(p)} className="w-full rounded-inner border border-line bg-card px-3 py-2 text-left text-sm text-ink hover:border-tint">
                {productLabel(p)} <span className="text-ink-soft">· {categoryDisplayName(p.category)}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="text-sm text-ink-soft">No matches.</li>}
        </ul>
      ) : (
        <>
          {recent.length > 0 && (
            <div className="mt-3">
              <span className="micro">Recently used</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {recent.map((p) => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)}
                    className="rounded-btn border border-line bg-card px-2.5 py-1 text-xs text-ink hover:border-tint">
                    {productLabel(p)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => { setCategory(c); setBrand(null); }}
                className={`rounded-btn px-3 py-1.5 text-sm ${c === category ? "text-card" : "border border-line text-ink-soft"}`}
                style={c === category ? { background: "var(--color-tint)" } : undefined}>{categoryDisplayName(c)}</button>
            ))}
          </div>
          <div className="mt-3">
            {brands.length > 0 && brand === null ? (
              <ul className="flex flex-col gap-1.5">
                {brands.map((b) => (
                  <li key={b}>
                    <button type="button" onClick={() => setBrand(b)} className="w-full rounded-inner border border-line bg-card px-3 py-2 text-left text-sm text-ink hover:border-tint">{b} →</button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {brand !== null && (
                  <button type="button" onClick={() => setBrand(null)} className="mb-2 text-sm text-ink-soft hover:text-ink">← All brands</button>
                )}
                <ul className="flex flex-col gap-1.5">
                  {(brand !== null ? productsInBrand(category, brand) : productsInCategory(category)).map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addProduct(p)} className="w-full rounded-inner border border-line bg-card px-3 py-2 text-left text-sm text-ink hover:border-tint">{productLabel(p)}</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <button type="button" onClick={addOther}
            className="mt-3 w-full rounded-inner border border-dashed border-line bg-card px-3 py-2 text-left text-sm text-ink-soft hover:border-tint hover:text-ink">
            Other / compounded medication
          </button>
        </>
      )}

      <h2 className="mt-8 font-display text-xl text-ink">Request items</h2>
      <div className="mt-3 flex flex-col gap-3">
        {/* Manual/compounded lines are identified by their freeText unit, not their category:
            the HA-filler toggle (spec 2026-07-08) may set an "Other" line's category to haFiller
            while it stays a free-text line, so branching on category would flip it to the
            structured editor and lose the free-text fields. */}
        {lines.map((l) => l.item.unit === "freeText" ? (
          <OtherLineEditor key={l.key} line={l} onChange={(item) => updateLine(l.key, item)} onRemove={() => removeLine(l.key)} />
        ) : (
          <LineEditor key={l.key} line={l} onChange={(item) => updateLine(l.key, item)} onRemove={() => removeLine(l.key)} />
        ))}
        {lines.length === 0 && <p className="text-sm text-ink-soft">No products added yet.</p>}
      </div>

      <label className="mt-6 block max-w-xs">
        <span className="micro">Prescribing doctor</span>
        {editing ? (
          // Resubmit locks the originally-addressed doctor (independent of the current gate), so
          // never show the "no cooperating doctors" message here — resubmission still works.
          <p className="mt-1 text-sm text-ink">Resubmitting to the originally-addressed doctor.</p>
        ) : doctors.length === 0 ? (
          // Cooperation-relationship gate is empty — never render an empty <select>; the
          // absent chosenDoctor already keeps canSubmit false (submit stays disabled).
          <p className="mt-1 text-sm text-ink-soft">No cooperating doctors yet — ask your platform admin to add one.</p>
        ) : (
          <select value={chosenDoctor} onChange={(e) => setDoctorId(e.target.value)} disabled={editing}
            className="mt-1 w-full rounded-field border border-line bg-card px-3 py-2 text-ink disabled:opacity-60">
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {editing && <span className="mt-1 block text-xs text-ink-faint">The addressed doctor can’t change while editing.</span>}
      </label>

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          {editingPending ? "Save changes" : editing ? "Resubmit request" : "Submit request"}
        </button>
        <Link href={`/app/patients/${id}`} className="rounded-btn border border-line px-5 py-2.5 text-sm text-ink-soft">Cancel</Link>
      </div>
    </div>
  );
}
