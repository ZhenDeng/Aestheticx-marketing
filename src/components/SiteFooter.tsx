import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { CONTACT_EMAIL, NAV_LINKS, PRODUCT_NAME } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="bg-paper">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <BrandMark size={32} />
              <span className="font-display text-xl text-ink">{PRODUCT_NAME}</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              Practice software for Australian aesthetic medicine. AestheticX supports your
              workflow; it does not provide medical or legal advice.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-10 gap-y-3">
            <ul className="space-y-2.5">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-ink-soft hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="space-y-2.5">
              <li>
                <Link href="/privacy" className="text-sm text-ink-soft hover:text-ink">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-ink-soft hover:text-ink">
                  Terms
                </Link>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-sm text-ink-soft hover:text-ink">
                  Contact
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="micro">© 2026 {PRODUCT_NAME} · Made for Australian aesthetic practices</p>
          <p className="micro">iOS · SwiftUI · Firebase</p>
        </div>
      </div>
    </footer>
  );
}
