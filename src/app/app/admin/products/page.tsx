"use client";

import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { ProductCatalogSection } from "@/components/admin/ProductCatalog";

// The Products tab (19/07 feedback): the product-catalog editor as its own platform-admin
// module, moved out of the Admin page. AuthGuard already keeps non-admins out; the role
// check is a belt-and-braces, mirroring the Admin page.
export default function AdminProductsPage() {
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  if (!identity) return null;
  if (identity.role !== "superAdmin") return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <header>
        <h1 className="font-display text-3xl text-ink">Products</h1>
        <p className="micro mt-1 tracking-widest">PLATFORM ADMINISTRATOR</p>
      </header>
      <ProductCatalogSection />
    </div>
  );
}
