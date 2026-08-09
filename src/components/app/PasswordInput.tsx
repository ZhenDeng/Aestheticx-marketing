"use client";

import { useState } from "react";

/**
 * Password input with a reveal toggle (the eye at the trailing edge), styled like the
 * app's other fields. Accepts standard input props so it works controlled (login,
 * first-login) or uncontrolled (demo form); the wrapper carries the usual `mt-1.5`.
 */
export default function PasswordInput(props: Omit<React.ComponentProps<"input">, "type" | "className">) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative mt-1.5">
      <input
        {...props}
        type={revealed ? "text" : "password"}
        className="w-full rounded-field border border-line bg-card px-3 py-2 pr-10 text-ink outline-none focus:border-tint"
      />
      <button
        type="button"
        aria-label={revealed ? "Hide password" : "Show password"}
        onClick={() => setRevealed((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-soft"
      >
        {revealed ? (
          /* eye with slash */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          /* eye */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
