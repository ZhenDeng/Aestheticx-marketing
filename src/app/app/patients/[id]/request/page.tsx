"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { patientPermissions } from "@/lib/demo/backend";
import type { MedicationItem, ProductCategory } from "@/lib/demo/types";
import {
  categoryDisplayName, productsInCategory, brandsInCategory, productsInBrand,
  searchProducts, productLabel, treatmentAreasFor, quantityCaption, unitSuffix, type CatalogProduct,
} from "@/lib/demo/catalog";

const CATEGORIES: ProductCategory[] = ["neurotoxin", "haFiller", "skinBooster", "collagenStimulator", "prpPrf"];

type Line = { key: string; item: MedicationItem };

function itemFromProduct(p: CatalogProduct): MedicationItem {
  return { name: p.name, dosage: "", category: p.category, brand: p.brand, unit: p.unit, areas: [] };
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
  const { identity, accounts } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  const [category, setCategory] = useState<ProductCategory>("neurotoxin");
  const [brand, setBrand] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [doctorId, setDoctorId] = useState<string>("");

  const doctors = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const acc of accounts) for (const idn of acc.identities) {
      if (idn.role === "doctor" && !seen.has(idn.user.id)) { seen.add(idn.user.id); out.push({ id: idn.user.id, name: idn.user.name }); }
    }
    return out;
  }, [accounts]);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;
  const patient = store.state.patients[id];
  if (!patient || !patientPermissions(identity, patient).canView) {
    return <p className="text-ink-soft">This patient is not in your view.</p>;
  }
  if (identity.role !== "nurse") {
    return <p className="text-ink-soft">Only a nurse can raise an authorisation request.</p>;
  }
  const me = identity;

  const defaultDoctor = patient.prescribingDoctorIDs.find((d) => doctors.some((x) => x.id === d)) ?? doctors[0]?.id ?? "";
  const chosenDoctor = doctorId || defaultDoctor;
  const brands = brandsInCategory(category);
  const results = query.trim() ? searchProducts(query) : [];

  function addProduct(p: CatalogProduct) {
    setLines((ls) => [...ls, { key: crypto.randomUUID(), item: itemFromProduct(p) }]);
  }
  function updateLine(key: string, item: MedicationItem) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, item } : l)));
  }
  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  const canSubmit = lines.length > 0 && lines.every((l) => l.item.dosage.trim()) && !!chosenDoctor;

  function submit() {
    if (!canSubmit) return;
    store.submitRequest({ patientID: id, doctorID: chosenDoctor, items: lines.map((l) => l.item), identity: me });
    router.push(`/app/patients/${id}`);
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/app/patients/${id}`} className="text-sm text-ink-soft hover:text-ink">← Back to patient</Link>
      <h1 className="mt-3 font-display text-3xl text-ink">Raise authorisation request</h1>

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
        </>
      )}

      <h2 className="mt-8 font-display text-xl text-ink">Request items</h2>
      <div className="mt-3 flex flex-col gap-3">
        {lines.map((l) => (
          <LineEditor key={l.key} line={l} onChange={(item) => updateLine(l.key, item)} onRemove={() => removeLine(l.key)} />
        ))}
        {lines.length === 0 && <p className="text-sm text-ink-soft">No products added yet.</p>}
      </div>

      <label className="mt-6 block max-w-xs">
        <span className="micro">Prescribing doctor</span>
        <select value={chosenDoctor} onChange={(e) => setDoctorId(e.target.value)}
          className="mt-1 w-full rounded-field border border-line bg-card px-3 py-2 text-ink">
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="rounded-btn px-5 py-2.5 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
          Submit request
        </button>
        <Link href={`/app/patients/${id}`} className="rounded-btn border border-line px-5 py-2.5 text-sm text-ink-soft">Cancel</Link>
      </div>
    </div>
  );
}
