"use client";

import { useMemo, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import type { Identity, ProductCategory, ProductUnit } from "@/lib/demo/types";
import { categoryDisplayName, PRODUCT_CATEGORIES, type CatalogProduct } from "@/lib/demo/catalog";

// The admin-editable prescribing catalog (Tier 3 #5B), extracted from the Admin console into
// its own Products tab (19/07 feedback). Same superAdmin-gated editor: list every product
// grouped by category with an active toggle, plus an add-product form. Writes go through the
// superAdmin setProduct / deactivateProduct callables in live, or the demo reducers in demo.

const PRODUCT_UNIT_OPTIONS: { value: ProductUnit; label: string }[] = [
  { value: "units", label: "Units (U)" },
  { value: "millilitres", label: "Millilitres (mL)" },
  { value: "vial", label: "Vial" },
  { value: "syringe", label: "Syringe" },
  { value: "tube", label: "Tube" },
  { value: "freeText", label: "Free text" },
];

export function ProductCatalogSection() {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  const [adding, setAdding] = useState(false);
  const products = store.catalogProducts();
  const groups = useMemo(() => PRODUCT_CATEGORIES
    .map((category) => ({ category, items: products.filter((p) => p.category === category) }))
    .filter((g) => g.items.length > 0), [products]);

  if (!identity) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-lg text-ink">Product catalog</h2>
      <p className="mt-1 text-sm text-ink-soft">
        The injectable products nurses can select. Add a product or deactivate one — changes take
        effect without an app release. Deactivated products stay in the catalog but are hidden from selection.
      </p>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No products yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.category} className="rounded-card border border-line bg-card shadow-card">
              <h3 className="border-b border-line px-4 py-2.5 font-display text-base text-ink">
                {categoryDisplayName(g.category)} <span className="text-sm text-ink-soft">· {g.items.length}</span>
              </h3>
              <ul>
                {g.items.map((p) => <ProductRow key={p.id} product={p} identity={identity} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <AddProductForm identity={identity} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 w-full rounded-btn border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-tint/50"
        >
          Add product
        </button>
      )}
    </section>
  );
}

function ProductRow({ product, identity }: { product: CatalogProduct; identity: Identity }) {
  const store = useDemoStore();
  const [error, setError] = useState<string | null>(null);
  function toggle() {
    setError(null);
    try { store.setProductActive(product.id, !product.isActive, identity); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update"); }
  }
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${product.isActive ? "text-ink" : "text-ink-soft line-through"}`}>
          {product.brand ? `${product.brand} · ${product.name}` : product.name}
        </p>
        <p className="text-xs text-ink-soft">{product.unit}{product.isActive ? "" : " · inactive"}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      <button
        onClick={toggle}
        className="shrink-0 rounded-btn border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-tint/50"
      >
        {product.isActive ? "Deactivate" : "Activate"}
      </button>
    </li>
  );
}

function AddProductForm({ identity, onDone, onCancel }: { identity: Identity; onDone: () => void; onCancel: () => void }) {
  const store = useDemoStore();
  const [category, setCategory] = useState<ProductCategory>("neurotoxin");
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<ProductUnit>("units");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    if (name.trim().length > 120) { setError("Name is too long (max 120)"); return; }
    if (brand.trim().length > 120) { setError("Brand is too long (max 120)"); return; }
    try {
      store.setProduct({ category, brand: brand.trim() || undefined, name: name.trim(), unit }, identity);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add product"); }
  }

  const field = "w-full rounded-btn border border-line bg-card px-3 py-2 text-sm text-ink";
  return (
    <div className="mt-4 rounded-card border border-line bg-card p-4 shadow-card">
      <h3 className="font-display text-base text-ink">Add product</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm text-ink-soft">
          Category
          <select className={`mt-1 ${field}`} value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)}>
            {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{categoryDisplayName(c)}</option>)}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          Unit
          <select className={`mt-1 ${field}`} value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)}>
            {PRODUCT_UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          Brand <span className="text-ink-soft/70">(optional)</span>
          <input className={`mt-1 ${field}`} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Juvederm" />
        </label>
        <label className="text-sm text-ink-soft">
          Name
          <input className={`mt-1 ${field}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Voluma" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={submit} className="rounded-btn bg-tint px-4 py-2 text-sm font-medium text-white hover:bg-tint/90">Add product</button>
        <button onClick={onCancel} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint/50">Cancel</button>
      </div>
    </div>
  );
}
