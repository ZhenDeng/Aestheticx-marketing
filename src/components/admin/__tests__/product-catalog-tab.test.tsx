// The Products tab (19/07 feedback): the product-catalog editor extracted from the Admin
// page into its own /app/admin/products route. Covers the page guard + the moved editor
// still listing/adding products through the store.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity } from "@/lib/demo/types";
import type { CatalogProduct } from "@/lib/demo/catalog";

const admin: Identity = { user: { id: "u-admin", name: "Priya Nair" }, role: "superAdmin", context: { kind: "independent" } };
let identity: Identity | null = admin;

const setProduct = vi.fn();
const setProductActive = vi.fn();
let products: CatalogProduct[] = [];

vi.mock("@/lib/demo/auth", () => ({
  useDemoAuth: () => ({ identity, availableIdentities: identity ? [identity] : [], selectIdentity: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "live",
    catalogProducts: () => products,
    setProduct,
    setProductActive,
  }),
}));

import AdminProductsPage from "@/app/app/admin/products/page";

async function renderSettled() {
  render(<AdminProductsPage />);
  await act(async () => {});
}

beforeEach(() => {
  setProduct.mockReset();
  setProductActive.mockReset();
  identity = admin;
  products = [
    { id: "neurotoxin-botox", category: "neurotoxin", brand: "Allergan", name: "Botox", unit: "units", isActive: true },
    { id: "hafiller-voluma", category: "haFiller", brand: "Juvederm", name: "Voluma", unit: "millilitres", isActive: false },
  ];
});

describe("AdminProductsPage", () => {
  it("renders the catalog editor grouped by category with active toggles", async () => {
    await renderSettled();
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Product catalog" })).toBeInTheDocument();
    expect(screen.getByText("Allergan · Botox")).toBeInTheDocument();
    expect(screen.getByText("Juvederm · Voluma")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(setProductActive).toHaveBeenCalledWith("neurotoxin-botox", false, admin);
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(setProductActive).toHaveBeenCalledWith("hafiller-voluma", true, admin);
  });

  it("adds a product through the add form", async () => {
    await renderSettled();
    await userEvent.click(screen.getByRole("button", { name: "Add product" }));
    await userEvent.type(screen.getByPlaceholderText("e.g. Voluma"), "Dysport");
    await userEvent.click(screen.getByRole("button", { name: "Add product" }));
    expect(setProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Dysport", category: "neurotoxin", unit: "units" }),
      admin,
    );
  });

  it("renders nothing for a non-superAdmin identity", async () => {
    identity = { user: { id: "u-voss", name: "Dr Voss" }, role: "doctor", context: { kind: "independent" } };
    const { container } = render(<AdminProductsPage />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });
});
