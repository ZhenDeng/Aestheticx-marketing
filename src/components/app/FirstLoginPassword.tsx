"use client";

import { useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { checkPasswordPolicy } from "@/lib/demo/securityPolicy";

// Forced first-login password change (port of iOS FirstLoginPasswordView, feedback-round-2 /
// auth-accounts screen 06). Shown live-only when the account's mustChangePassword claim is
// set; submit unlocks only when the PasswordPolicy is satisfied and the confirmation matches.
export function FirstLoginPassword() {
  const { identity, completeFirstLogin, signOut } = useDemoAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = checkPasswordPolicy(password);
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = result.satisfied && matches && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await completeFirstLogin(password);
      // The gate lifts via context state; the app renders underneath.
    } catch (e) {
      // FirstLoginConfirmError (src/lib/firebase/auth.ts): updatePassword succeeded but
      // the callable/token refresh didn't — the new password IS set; resubmitting only
      // needs to finish the confirmation. Matched by name so firebase stays lazy-loaded.
      setError(
        e instanceof Error && e.name === "FirstLoginConfirmError"
          ? "Your new password is saved, but confirming with the server failed — try submitting again with the same password."
          : "Your password could not be set. Please check your connection and try again.",
      );
      setBusy(false);
    }
  }

  const chips: { label: string; ok: boolean }[] = [
    { label: "8+ chars", ok: result.hasMinLength },
    { label: "upper", ok: result.hasUppercase },
    { label: "number", ok: result.hasNumber },
    { label: "symbol", ok: result.hasSymbol },
  ];

  return (
    <div className="flex min-h-screen items-start justify-center bg-card px-5 py-16">
      <form onSubmit={submit} className="w-full max-w-md">
        <p className="kicker">First sign-in</p>
        <h1 className="mt-3 font-display text-3xl text-ink">Set your password</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Welcome{identity ? `, ${identity.user.name}` : ""}. Choose a password before continuing —
          your temporary one won&apos;t work again.
        </p>

        <div className="mt-6 rounded-card border border-line bg-card p-5 shadow-card">
          <label className="block">
            <span className="micro">New password</span>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.label}
                className="micro rounded-full px-2.5 py-1"
                style={c.ok
                  ? { background: "var(--color-sage-soft)", color: "var(--color-sage)" }
                  : { background: "var(--color-line)", color: "var(--color-ink-soft)" }}
              >
                {c.label}
              </span>
            ))}
          </div>
          <label className="mt-4 block">
            <span className="micro">Confirm password</span>
            <input
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint"
            />
          </label>
          {confirm.length > 0 && !matches && (
            <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>Passwords don&apos;t match</p>
          )}
        </div>

        {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

        <button
          type="submit" disabled={!canSubmit}
          className="mt-6 w-full rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors disabled:opacity-60"
          style={{ background: "var(--color-tint, var(--color-ink))" }}
        >
          {busy ? "Setting password…" : "Set password & continue"}
        </button>
        <button
          type="button" onClick={signOut}
          className="mt-3 w-full rounded-btn border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-tint/50"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
