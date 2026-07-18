import type { Metadata } from "next";
import Link from "next/link";
import { LiveLoginForm } from "@/components/app/LoginForm";
import { isFirebaseConfigured } from "@/lib/firebase/client";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to AestheticX.",
  robots: { index: false, follow: false },
};

// Server component, so the page stays statically prerendered — LiveLoginForm reads
// window.location at call time rather than using useSearchParams, which would force a
// Suspense boundary and drop this route out of the prerender.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-card px-5 py-16">
      <Link href="/" className="font-display text-lg text-ink-soft hover:text-ink">
        ← AestheticX
      </Link>
      {isFirebaseConfigured() ? <LiveLoginForm /> : <NotConfigured />}
    </main>
  );
}

// Local dev, preview builds and the E2E run have no Firebase credentials. Say so plainly and
// point at the demo, rather than silently swapping in the role picker — that dual-purpose
// /login is exactly the ambiguity this route split removes.
function NotConfigured() {
  return (
    <div className="w-full max-w-md rounded-card border border-line bg-card p-7 shadow-card">
      <p className="kicker">Sign in</p>
      <h1 className="mt-3 font-display text-2xl text-ink">Sign-in is unavailable</h1>
      <p className="mt-2 text-sm text-ink-soft">
        This build has no AestheticX account backend configured, so there is nothing to sign in
        to. You can still explore the product with sample data.
      </p>
      <Link
        href="/demo"
        className="mt-6 block w-full rounded-btn px-4 py-3 text-center text-sm font-medium text-card transition-colors"
        style={{ background: "var(--color-tint)" }}
      >
        Try the demo
      </Link>
    </div>
  );
}
