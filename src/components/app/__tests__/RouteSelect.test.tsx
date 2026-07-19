import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteSelect } from "@/components/app/RouteSelect";
import { ROUTES_OF_ADMINISTRATION, ROUTE_DISPLAY_LABELS } from "@/lib/demo/types";

// The five routes of administration are a legal enumeration printed onto a Clause 68C direction.
// This control is shared by the request form (choosing one per line item) and the direction
// capture dialog (the legacy fallback), so its refusals matter on both surfaces.

const select = () => screen.getByLabelText(/route/i) as HTMLSelectElement;

describe("RouteSelect", () => {
  it("offers the five routes by display label, and nothing else", () => {
    render(<RouteSelect value={undefined} onChange={() => {}} />);
    expect([...select().options].map((o) => o.value).filter(Boolean)).toEqual([...ROUTES_OF_ADMINISTRATION]);
    expect(screen.getByRole("option", { name: ROUTE_DISPLAY_LABELS.supraPeriosteal })).toBeInTheDocument();
  });

  it("rests on a disabled placeholder when nothing is chosen", () => {
    render(<RouteSelect value={undefined} onChange={() => {}} />);
    expect(select().value).toBe("");
    expect(screen.getByRole("option", { name: /select route/i })).toBeDisabled();
  });

  it("shows a canonical value as its display label", () => {
    render(<RouteSelect value="supraPeriosteal" onChange={() => {}} />);
    expect(select().value).toBe("supraPeriosteal");
    expect(select().options[select().selectedIndex].textContent).toBe("Supra-periosteal");
  });

  // The trap this guards: a select handed a value matching no option silently selects its first
  // ENABLED option. Without the backstop, "Intramuscular" (a stored value that is not the
  // canonical "intramuscular") would display as "Intradermal" — a DIFFERENT route from the one
  // held, on a control whose whole purpose is letting a clinician verify before export.
  it("never substitutes a different route for an unrecognised value", () => {
    for (const stored of ["Intramuscular", "IM", "topical"]) {
      const { unmount } = render(<RouteSelect value={stored} onChange={() => {}} />);
      expect(select().value).toBe(stored);
      expect(select().options[select().selectedIndex].textContent).toMatch(/not a recognised route/i);
      unmount();
    }
  });

  it("marks itself invalid and describable when asked", () => {
    render(<RouteSelect value={undefined} onChange={() => {}} invalid describedBy="why" />);
    expect(select()).toHaveAttribute("aria-invalid", "true");
    expect(select()).toHaveAttribute("aria-describedby", "why");
    expect(screen.getByText(/route of administration/i).textContent).toMatch(/needed/i);
  });
});
