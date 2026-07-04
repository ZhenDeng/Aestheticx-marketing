"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { safeNextPath } from "@/lib/demo/authRedirect";
import { identityBadge } from "@/lib/demo/types";

// The post-login destination: the guarded page that sent us here (?next=), or the
// dashboard. Read from window.location at call time — useSearchParams would force a
// Suspense boundary and drop the login page out of static prerender.
function nextDestination(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

export function LoginForm() {
  const { mode } = useDemoAuth();
  return mode === "live" ? <LiveLogin /> : <DemoLogin />;
}

function LiveLogin() {
  const { signInLive, identity } = useDemoAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // In live mode the identity is resolved asynchronously by the Firebase auth
  // listener (after sign-in + the user-doc read), so redirect reactively once it
  // lands — pushing immediately after signInLive() would race the AuthGuard and
  // bounce back to /login. This also forwards an already-signed-in user, honouring
  // the ?next= target the AuthGuard carried over.
  useEffect(() => {
    if (identity) router.replace(nextDestination());
  }, [identity, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInLive(email, password);
      // Redirect handled by the effect above once the identity resolves.
    } catch {
      setError("Sign-in failed. Check your email and password.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-card border border-line bg-card p-7 shadow-card">
      <p className="kicker">Sign in</p>
      <h1 className="mt-3 font-display text-2xl text-ink">AestheticX</h1>
      <p className="mt-2 text-sm text-ink-soft">Sign in with your AestheticX account.</p>
      <label className="mt-6 block">
        <span className="micro">Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint" />
      </label>
      <label className="mt-4 block">
        <span className="micro">Password</span>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint" />
      </label>
      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <button type="submit" disabled={busy}
        className="mt-6 w-full rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors disabled:opacity-60"
        style={{ background: "var(--color-tint)" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function DemoLogin() {
  const { accounts, signIn } = useDemoAuth();
  const router = useRouter();
  const [selected, setSelected] = useState(0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    signIn(accounts[selected].identities[0]);
    router.push(nextDestination());
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-card border border-line bg-card p-7 shadow-card">
      <p className="kicker">Demo sign-in</p>
      <h1 className="mt-3 font-display text-2xl text-ink">Choose a role to explore AestheticX</h1>
      <p className="mt-2 text-sm text-ink-soft">
        This is an interactive demo using the same sample data as the iOS app. Pick an account — the
        whole app re-tints to that identity. Data resets on refresh.
      </p>
      <fieldset className="mt-6 flex flex-col gap-2.5">
        {accounts.map((account, i) => {
          const checked = i === selected;
          return (
            <label key={account.label}
              className={`flex cursor-pointer items-center gap-3 rounded-inner border px-4 py-3 transition-colors ${checked ? "border-tint" : "border-line hover:border-tint/50"}`}
              style={checked ? { boxShadow: "0 0 0 3px var(--color-tint-soft)" } : undefined}>
              <input type="radio" name="account" className="sr-only" checked={checked} onChange={() => setSelected(i)} />
              <span className="min-w-0">
                <span className="block font-medium text-ink">{account.label}</span>
                <span className="block truncate text-sm text-ink-soft">{identityBadge(account.identities[0])}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <label className="mt-5 block">
        <span className="micro">Password (any value works in the demo)</span>
        <input type="password" defaultValue="demo"
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint" />
      </label>
      <button type="submit" className="mt-6 w-full rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors"
        style={{ background: "var(--color-tint)" }}>
        Enter the demo
      </button>
    </form>
  );
}
