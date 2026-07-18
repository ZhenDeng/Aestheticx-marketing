import type { Metadata } from "next";
import Link from "next/link";
import { DemoLoginForm } from "@/components/app/LoginForm";

export const metadata: Metadata = {
  title: "Try the demo",
  description: "Explore AestheticX with sample data — no account needed.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-card px-5 py-16">
      <Link href="/" className="font-display text-lg text-ink-soft hover:text-ink">
        ← AestheticX
      </Link>
      <DemoLoginForm />
      <p className="text-center text-sm text-ink-soft">
        Have an account?{" "}
        <Link href="/login" className="underline hover:text-ink">
          Sign in
        </Link>
      </p>
    </main>
  );
}
