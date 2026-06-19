import { SiteNav } from "@/components/SiteNav";
import { Hero } from "@/components/Hero";
import { TrustStrip } from "@/components/TrustStrip";
import { KeyPoints } from "@/components/KeyPoints";
import { ComplianceSection } from "@/components/ComplianceSection";
import { WhoForSection } from "@/components/WhoForSection";
import { FaqSection } from "@/components/FaqSection";
import { FinalCta } from "@/components/FinalCta";
import { SiteFooter } from "@/components/SiteFooter";
import { FAQS } from "@/lib/content";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AestheticX",
  applicationCategory: "MedicalApplication",
  operatingSystem: "iOS",
  description:
    "iOS app for Australian aesthetic-medicine practices: multi-role accounts, patient records, consent forms, the nurse-to-doctor treatment-authorisation workflow, appointments, teleconsults, and authorisation-based billing.",
  audience: {
    "@type": "Audience",
    audienceType: "Aesthetic medicine clinicians and clinics",
  },
  mainEntity: {
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <TrustStrip />
        <KeyPoints />
        <WhoForSection />
        <ComplianceSection />
        <FaqSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
