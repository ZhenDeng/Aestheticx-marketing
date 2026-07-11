// Request-builder helpers ported from iOS AXFeatures/AuthorisationRequestBuilder.swift
// + AXDomain/PrescribingProducts.swift (RecentlyUsedProducts).
import { productById, PRODUCT_CATALOG, type CatalogProduct } from "./catalog";

// iOS RecentlyUsedProducts default capacity (PrescribingProducts.swift:189).
export const RECENTLY_USED_CAPACITY = 8;

// Same key iOS RecentlyUsedStore uses in UserDefaults ("per device, spec") —
// device-local on web too, via localStorage.
export const RECENTLY_USED_STORAGE_KEY = "ax.recentlyUsedProducts";

// Port of RecentlyUsedProducts.record: most-recent-first, de-duplicated, capped.
export function recordRecentlyUsed(
  ids: string[],
  id: string,
  capacity: number = RECENTLY_USED_CAPACITY,
): string[] {
  const cap = Math.max(1, capacity);
  return [id, ...ids.filter((x) => x !== id)].slice(0, cap);
}

// Port of RecentlyUsedProducts.resolve(in:): ids → catalog products,
// preserving recency order and dropping ids no longer in the catalog.
// Recently-used resolves to ACTIVE products only (iOS `resolve(in:)` parity) — a product that has
// since been deactivated drops off the recently-used row rather than being offered again.
export function resolveRecentlyUsed(ids: string[], catalog: CatalogProduct[] = PRODUCT_CATALOG): CatalogProduct[] {
  return ids
    .map((id) => productById(id, catalog))
    .filter((p): p is CatalogProduct => p !== undefined && p.isActive);
}

// Port of RecentlyUsedStore.load — tolerant of missing/corrupt storage, and
// truncated to capacity like the iOS initialiser's prefix(capacity).
export function loadRecentlyUsed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTLY_USED_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .slice(0, RECENTLY_USED_CAPACITY);
  } catch {
    return [];
  }
}

// Port of RecentlyUsedStore.record — persists and returns the updated list.
export function recordRecentlyUsedProduct(id: string): string[] {
  const next = recordRecentlyUsed(loadRecentlyUsed(), id);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RECENTLY_USED_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode/quota) — recently-used just won't persist.
    }
  }
  return next;
}

// Port of LineItemEditorView.commit() for .other: a non-empty route is folded
// into the dosage as "dose · route" (route alone when the dose is empty);
// an empty route leaves the dosage exactly as typed.
export function composeOtherDosage(dosage: string, route: string): string {
  const trimmedRoute = route.trim();
  if (!trimmedRoute) return dosage;
  const dose = dosage.trim();
  return dose ? `${dose} · ${trimmedRoute}` : trimmedRoute;
}

// Port of LineItemEditorView.customAreas(): comma-split, trimmed, empties dropped.
export function splitCustomAreas(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
