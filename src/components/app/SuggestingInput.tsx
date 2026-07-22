"use client";

// The shared combobox affordance (22/07 feedback): a text input whose typed value stays
// authoritative, with a dropdown of suggestions the user may pick from. A suggestion is a
// shortcut, never a gate — callers must treat the typed text as valid on its own, because
// both suggestion sources (product catalog, address geocoder) are incomplete by nature.
//
// ARIA combobox pattern: options are not tab stops; aria-activedescendant tracks the
// keyboard-highlighted option, Enter picks it without submitting the enclosing form.
import { useId, useState } from "react";

export interface Suggestion {
  id: string;
  label: string;
  /** Secondary text shown after the label, e.g. a product's dose unit. */
  detail?: string;
}

export function SuggestingInput({
  value, onChangeText, onSelect, suggestions, placeholder, className, ariaLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (s: Suggestion) => void;
  suggestions: Suggestion[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  // Starts dismissed so an existing value (edit forms) shows no dropdown until the user
  // actually types; selection and Escape re-dismiss until the next keystroke.
  const [dismissed, setDismissed] = useState(true);
  const [active, setActive] = useState(-1);
  const open = focused && !dismissed && suggestions.length > 0;

  function choose(s: Suggestion) {
    setDismissed(true);
    setActive(-1);
    onSelect(s);
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => { setDismissed(false); setActive(-1); onChangeText(e.target.value); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (open) setActive((i) => Math.min(i + 1, suggestions.length - 1));
            else setDismissed(false);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (open) setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && active >= 0) { e.preventDefault(); choose(suggestions[active]); }
          } else if (e.key === "Escape") {
            if (open) { e.stopPropagation(); setDismissed(true); }
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel ? `${ariaLabel} suggestions` : "Suggestions"}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-inner border border-line bg-card py-1 shadow-card"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: it fires before the input's blur closes the list.
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm text-ink ${i === active ? "bg-paper" : ""}`}
            >
              {s.label}
              {s.detail && <span className="text-ink-soft"> · {s.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
