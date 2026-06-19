"use client";

import { useState } from "react";
import { SealMark } from "./SealMark";
import { APP_STORE_URL, NAV_LINKS, PRODUCT_NAME } from "@/lib/site";

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <nav className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label={`${PRODUCT_NAME} home`}>
          <SealMark size={34} />
          <span className="font-display text-[1.35rem] leading-none tracking-tight text-ink">
            {PRODUCT_NAME}
          </span>
        </a>

        <ul className="hidden items-center gap-9 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm text-ink-soft transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <a
            href={APP_STORE_URL}
            className="hidden rounded-btn bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-umber sm:inline-block"
          >
            Get the app
          </a>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-field border border-line text-ink md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden className="text-lg leading-none">
              {open ? "✕" : "☰"}
            </span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-line/70 bg-paper md:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col px-5 py-2 sm:px-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block py-3 text-ink-soft"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={APP_STORE_URL}
                className="mt-2 mb-3 block rounded-btn bg-ink px-5 py-3 text-center text-sm font-medium text-paper"
                onClick={() => setOpen(false)}
              >
                Get the app
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
