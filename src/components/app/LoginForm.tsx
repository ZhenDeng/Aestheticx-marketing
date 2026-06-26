"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { identityBadge } from "@/lib/demo/types";

export function LoginForm() {
  const { accounts, signIn } = useDemoAuth();
  const router = useRouter();
  const [selected, setSelected] = useState(0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const account = accounts[selected];
    signIn(account.identities[0]); // first identity is the default
    router.push("/app/dashboard");
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
            <label
              key={account.label}
              className={`flex cursor-pointer items-center gap-3 rounded-inner border px-4 py-3 transition-colors ${
                checked ? "border-tint" : "border-line hover:border-tint/50"
              }`}
              style={checked ? { boxShadow: "0 0 0 3px var(--color-tint-soft)" } : undefined}
            >
              <input
                type="radio"
                name="account"
                className="sr-only"
                checked={checked}
                onChange={() => setSelected(i)}
              />
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
        <input
          type="password"
          defaultValue="demo"
          className="mt-1.5 w-full rounded-field border border-line bg-card px-3 py-2 text-ink outline-none focus:border-tint"
        />
      </label>

      <button
        type="submit"
        className="mt-6 w-full rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors"
        style={{ background: "var(--color-tint)" }}
      >
        Enter the demo
      </button>
    </form>
  );
}
