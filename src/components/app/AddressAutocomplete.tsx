"use client";

// Address entry assisted by the geocoder (22/07 feedback #2): typing shows matching street
// addresses; picking one fills the field with the formatted single line. The field remains a
// plain string — rural properties, unit prefixes and new estates won't all geocode, so typed
// text is always accepted as-is.
import { useEffect, useRef, useState } from "react";
import { searchAddresses, type AddressSuggestion, type GeoPoint } from "@/lib/addressSearch";
import { SuggestingInput } from "@/components/app/SuggestingInput";

export function AddressAutocomplete({ value, onChange, className, placeholder, ariaLabel = "Address", debounceMs = 250, near }: {
  value: string;
  onChange: (address: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Injectable so tests can run without timers. */
  debounceMs?: number;
  /** Proximity hint for ranking — see `useAddressBias`. Ordering only; nothing is excluded. */
  near?: GeoPoint;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // The last value that arrived by selection (seeded with the initial value so mounting an
  // edit form doesn't fire a lookup for an address nobody is typing).
  const settledRef = useRef<string>(value);

  useEffect(() => {
    if (value === settledRef.current || value.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      void searchAddresses(value, { signal: controller.signal, near }).then((results) => {
        if (!controller.signal.aborted) setSuggestions(results);
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [value, debounceMs, near]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <SuggestingInput
      value={value}
      onChangeText={onChange}
      onSelect={(s) => {
        settledRef.current = s.label;
        setSuggestions([]);
        onChange(s.label);
      }}
      suggestions={suggestions}
      placeholder={placeholder}
      className={className}
      ariaLabel={ariaLabel}
    />
  );
}
