import Link from "next/link";
import { Reveal } from "./Reveal";
import { SealMark } from "./SealMark";
import { APP_STORE_URL } from "@/lib/site";

export function FinalCta() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-8 w-fit">
            <SealMark size={64} />
          </div>
          <h2 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] font-[430] leading-[1.05] tracking-[-0.02em] text-ink">
            A clinical instrument with the
            <br className="hidden sm:block" /> manner of a private{" "}
            <em className="font-[330] italic text-gold-deep">atelier</em>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[1.05rem] leading-relaxed text-ink-soft">
            Bring your records, consent, authorisations, and billing into one calm, precise place
            built for Australian aesthetic medicine.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a
              href={APP_STORE_URL}
              className="rounded-btn bg-ink px-7 py-3.5 text-sm font-medium text-paper transition-colors hover:bg-umber"
            >
              Get the app
            </a>
            <Link
              href="/#features"
              className="rounded-btn border border-line bg-card px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:border-gold"
            >
              Explore features
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
