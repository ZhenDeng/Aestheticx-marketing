const ITEMS = [
  "AHPRA & ABN on every identity",
  "Australian data residency",
  "Off-label clause on every consent",
  "Server-enforced authorisations",
];

export function TrustStrip() {
  return (
    <section aria-label="At a glance" className="border-b border-line bg-paper-deep/50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-5 sm:px-8">
        {ITEMS.map((item) => (
          <span key={item} className="flex items-center gap-2.5">
            <span className="text-gold" aria-hidden>
              ◆
            </span>
            <span className="micro !text-ink-soft">{item}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
