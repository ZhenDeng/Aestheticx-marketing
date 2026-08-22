"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SuggestingInput } from "@/components/app/SuggestingInput";
import { searchAddresses, type AddressSuggestion, type GeoPoint } from "@/lib/addressSearch";
import {
  autocompleteAddress,
  resolveAddress,
  type AddressPrediction,
} from "@/lib/firebase/addressLookup";

const PHOTON_ATTRIBUTION = {
  label: "© OpenStreetMap contributors",
  href: "https://www.openstreetmap.org/copyright",
};

type AutocompleteAddress = (input: string, sessionToken: string) => Promise<AddressPrediction[]>;
type ResolveAddress = (placeId: string, input: string, sessionToken: string) => Promise<string>;

interface SharedAddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export interface GoogleAddressAutocompleteProps extends SharedAddressAutocompleteProps {
  autocomplete?: AutocompleteAddress;
  resolve?: ResolveAddress;
}

export interface AddressAutocompleteProps extends SharedAddressAutocompleteProps {
  debounceMs?: number;
  near?: GeoPoint;
}

/**
 * The existing Photon-assisted input retained for profile, admin, and public-intake callers.
 * Live patient forms use the separate `GoogleAddressAutocomplete` API.
 *
 * @example
 * <AddressAutocomplete value={address} onChange={setAddress} near={near} />
 */
export function AddressAutocomplete(props: AddressAutocompleteProps) {
  return <LegacyAddressAutocomplete {...props} />;
}

/** Controlled Google Places combobox for authenticated live address entry. */
export function GoogleAddressAutocomplete({
  value,
  onChange,
  className,
  placeholder,
  ariaLabel = "Address",
  autocomplete = autocompleteAddress,
  resolve = resolveAddress,
}: GoogleAddressAutocompleteProps) {
  const generatedId = useId();
  const listId = `${generatedId}-address-listbox`;
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [activeIndex, setActiveIndexState] = useState(-1);

  const valueRef = useRef(value);
  const queryRef = useRef(value);
  const sessionRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const activeIndexRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const selectionRef = useRef<string | null>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

  const open = focused && !dismissed && predictions.length > 0;

  function cancelScheduledLookup() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function setActiveIndex(next: number, scroll = false) {
    activeIndexRef.current = next;
    setActiveIndexState(next);
    if (scroll && next >= 0) {
      optionRefs.current[next]?.scrollIntoView?.({ block: "nearest" });
    }
  }

  function settleSession() {
    cancelScheduledLookup();
    generationRef.current += 1;
    sessionRef.current = null;
    selectionRef.current = null;
    setPredictions([]);
    setDismissed(true);
    setActiveIndex(-1);
  }

  useEffect(() => {
    if (value === valueRef.current) return;
    valueRef.current = value;
    queryRef.current = value;
    settleSession();
    // `settleSession` consists only of stable refs/setters; value is the external-change signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelScheduledLookup();
      generationRef.current += 1;
      sessionRef.current = null;
      selectionRef.current = null;
    };
  }, []);

  function handleChange(nextValue: string, nativeEvent: Event) {
    cancelScheduledLookup();
    generationRef.current += 1;
    const generation = generationRef.current;

    setPredictions([]);
    setActiveIndex(-1);
    const selectionWasPending = selectionRef.current !== null;
    selectionRef.current = null;
    const inputType = "inputType" in nativeEvent && typeof nativeEvent.inputType === "string"
      ? nativeEvent.inputType
      : null;
    // Native autofill is exposed as a replacement input (Safari) or an input/change event
    // without a typing inputType (Chromium). Actual typing, deletion, and paste all provide
    // their own inputType and remain eligible for suggestions.
    const autofillSettlement = nativeEvent.type === "change"
      || inputType === "insertReplacementText"
      || (nativeEvent.type === "input" && inputType === null);
    if (selectionWasPending || autofillSettlement) sessionRef.current = null;
    queryRef.current = nextValue;
    valueRef.current = nextValue;
    onChange(nextValue);

    if (autofillSettlement) {
      setDismissed(true);
      return;
    }
    setDismissed(false);

    const input = nextValue.trim();
    if (input.length < 4) {
      sessionRef.current = null;
      return;
    }

    const sessionToken = sessionRef.current ?? crypto.randomUUID();
    sessionRef.current = sessionToken;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      let request: Promise<AddressPrediction[]>;
      try {
        request = autocomplete(input, sessionToken);
      } catch {
        if (mountedRef.current
          && generationRef.current === generation
          && queryRef.current === nextValue
          && sessionRef.current === sessionToken) {
          setPredictions([]);
          setActiveIndex(-1);
        }
        return;
      }
      void request
        .then((results) => {
          if (!mountedRef.current
            || generationRef.current !== generation
            || queryRef.current !== nextValue
            || sessionRef.current !== sessionToken) return;
          setPredictions(results);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (!mountedRef.current
            || generationRef.current !== generation
            || queryRef.current !== nextValue
            || sessionRef.current !== sessionToken) return;
          setPredictions([]);
          setActiveIndex(-1);
        });
    }, 250);
  }

  async function choose(prediction: AddressPrediction) {
    const sessionToken = sessionRef.current;
    if (!sessionToken) return;

    const input = valueRef.current;
    const selectionKey = `${sessionToken}:${prediction.placeId}:${input}`;
    if (selectionRef.current === selectionKey) return;
    selectionRef.current = selectionKey;

    cancelScheduledLookup();
    generationRef.current += 1;
    setPredictions([]);
    setDismissed(true);
    setActiveIndex(-1);

    try {
      const resolvedAddress = await resolve(prediction.placeId, input, sessionToken);
      if (mountedRef.current
        && selectionRef.current === selectionKey
        && valueRef.current === input
        && queryRef.current === input
        && sessionRef.current === sessionToken
        && resolvedAddress.trim()) {
        valueRef.current = resolvedAddress;
        queryRef.current = resolvedAddress;
        onChange(resolvedAddress);
      }
    } catch {
      // A failed Place Details request deliberately leaves the exact controlled text intact.
    } finally {
      if (selectionRef.current === selectionKey) selectionRef.current = null;
      if (sessionRef.current === sessionToken) sessionRef.current = null;
    }
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        autoComplete="street-address"
        value={value}
        placeholder={placeholder}
        className={className}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          settleSession();
        }}
        onChange={(event) => handleChange(event.target.value, event.nativeEvent)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && open) {
            event.preventDefault();
            setActiveIndex(Math.min(activeIndexRef.current + 1, predictions.length - 1), true);
          } else if (event.key === "ArrowUp" && open) {
            event.preventDefault();
            setActiveIndex(Math.max(activeIndexRef.current - 1, 0), true);
          } else if (event.key === "Enter" && open && activeIndexRef.current >= 0) {
            event.preventDefault();
            void choose(predictions[activeIndexRef.current]);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            cancelScheduledLookup();
            generationRef.current += 1;
            setPredictions([]);
            setDismissed(true);
            setActiveIndex(-1);
          }
        }}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-inner border border-line bg-card shadow-card">
          <ul id={listId} role="listbox" aria-label={`${ariaLabel} suggestions`} className="max-h-56 overflow-auto py-1">
            {predictions.map((prediction, index) => (
              <li
                key={prediction.placeId}
                ref={(node) => { optionRefs.current[index] = node; }}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onPointerDown={(event) => {
                  event.preventDefault();
                  void choose(prediction);
                }}
                onClick={() => { void choose(prediction); }}
                onPointerMove={() => setActiveIndex(index)}
                className={`cursor-pointer px-3 py-1.5 text-sm text-ink ${index === activeIndex ? "bg-paper" : ""}`}
              >
                {prediction.label}
              </li>
            ))}
          </ul>
          <div
            translate="no"
            className="border-t border-line px-3 py-1.5"
            style={{
              color: "#5e5e5e",
              fontFamily: "sans-serif",
              fontSize: "12px",
              fontWeight: 400,
              whiteSpace: "nowrap",
            }}
          >Google Maps</div>
        </div>
      )}
    </div>
  );
}

function LegacyAddressAutocomplete({
  value,
  onChange,
  className,
  placeholder,
  ariaLabel = "Address",
  debounceMs = 250,
  near,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);
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
      onSelect={(suggestion) => {
        settledRef.current = suggestion.label;
        setSuggestions([]);
        onChange(suggestion.label);
      }}
      suggestions={suggestions}
      placeholder={placeholder}
      className={className}
      ariaLabel={ariaLabel}
      attribution={PHOTON_ATTRIBUTION}
    />
  );
}
