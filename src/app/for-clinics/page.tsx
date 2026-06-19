import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { FinalCta } from "@/components/FinalCta";
import { RoleGuide } from "@/components/RoleGuide";
import { ROLE_PAGES } from "@/lib/content";

export const metadata: Metadata = {
  title: "For clinic management",
  description: ROLE_PAGES.clinics.intro,
  alternates: { canonical: "/for-clinics" },
};

export default function ForClinics() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <RoleGuide slug="clinics" />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
