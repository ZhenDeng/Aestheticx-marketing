import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/app/LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to the AestheticX interactive demo.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-card px-5 py-16">
      <Link href="/" className="font-display text-lg text-ink-soft hover:text-ink">
        ← AestheticX
      </Link>
      <LoginForm />
    </main>
  );
}
