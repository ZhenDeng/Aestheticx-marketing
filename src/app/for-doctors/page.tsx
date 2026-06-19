import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { FinalCta } from "@/components/FinalCta";
import { RoleGuide } from "@/components/RoleGuide";
import { ROLE_PAGES } from "@/lib/content";

export const metadata: Metadata = {
  title: "For prescribing doctors",
  description: ROLE_PAGES.doctors.intro,
  alternates: { canonical: "/for-doctors" },
};

export default function ForDoctors() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <RoleGuide slug="doctors" />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
