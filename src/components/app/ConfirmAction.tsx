"use client";

import { useState, type CSSProperties } from "react";

// Shared inline two-step for destructive actions (16/07 feedback bug 3, safety step):
// the app's established confirming idiom (account / patient / relationship deletes)
// extracted once so calendar cancel and invoice delete speak the same grammar — first
// tap swaps the trigger for an explicit prompt with a rose-filled commit and a quiet
// Keep, and nothing fires until the commit is pressed.
export function ConfirmAction({ label, prompt, confirmLabel, keepLabel = "Keep", onConfirm, disabled, triggerClassName, triggerStyle }: {
  label: string;
  prompt: string;
  confirmLabel: string;
  keepLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Styling for the idle trigger, so it can match its surroundings (defaults to the app's quiet rose ghost). */
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        className={triggerClassName ?? "rounded-btn border border-line px-3 py-1.5 text-sm disabled:opacity-50"}
        style={triggerStyle ?? { color: "var(--color-rose)" }}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink">{prompt}</span>
      <button
        type="button"
        onClick={() => { setConfirming(false); onConfirm(); }}
        className="rounded-btn px-3 py-1.5 text-sm font-medium text-card"
        style={{ background: "var(--color-rose)" }}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft"
      >
        {keepLabel}
      </button>
    </span>
  );
}
