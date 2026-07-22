"use client";

// Medication name entry assisted by the prescribing catalog (22/07 feedback #1). The value is
// still a plain string — a treatment note may record a product the catalog doesn't carry — so
// this narrows typing effort, not what may be saved.
import { useMemo } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { effectiveCatalog, productLabel, searchProducts, unitSuffix } from "@/lib/demo/catalog";
import { SuggestingInput } from "@/components/app/SuggestingInput";

export function MedicationCombobox({ value, onChange, className, placeholder = "Medication", ariaLabel = "Medication" }: {
  value: string;
  onChange: (name: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const store = useDemoStore();
  const catalog = useMemo(() => effectiveCatalog(store.state.productsByID), [store.state.productsByID]);
  const suggestions = useMemo(
    () => searchProducts(value, catalog).slice(0, 8).map((p) => ({
      id: p.id,
      label: productLabel(p),
      detail: unitSuffix(p.unit) || undefined,
    })),
    [value, catalog],
  );
  return (
    <SuggestingInput
      value={value}
      onChangeText={onChange}
      onSelect={(s) => onChange(s.label)}
      suggestions={suggestions}
      placeholder={placeholder}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}
