import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { FinalCta } from "@/components/FinalCta";
import { RoleGuide } from "@/components/RoleGuide";
import { ROLE_PAGES } from "@/lib/content";

export const metadata: Metadata = {
  title: "For injecting nurses",
  description: ROLE_PAGES.nurses.intro,
  alternates: { canonical: "/for-nurses" },
};

export default function ForNurses() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <RoleGuide slug="nurses" />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
