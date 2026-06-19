interface SealMarkProps {
  size?: number;
  className?: string;
}

/**
 * The AestheticX engraved seal: a hairline gold ring on porcelain holding a
 * serif "A" in ink with a champagne italic "x" tucked at its baseline.
 * The same seal language used for authorisations and the off-label clause.
 */
export function SealMark({ size = 44, className }: SealMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="AestheticX seal"
    >
      <circle
        cx="50"
        cy="50"
        r="38"
        fill="none"
        stroke="var(--color-gold)"
        strokeWidth="1.4"
      />
      <text
        x="49"
        y="64"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontSize="46"
        fill="var(--color-ink)"
      >
        A
      </text>
      <text
        x="69"
        y="66"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontStyle="italic"
        fontSize="24"
        fill="var(--color-gold-deep)"
      >
        x
      </text>
    </svg>
  );
}
