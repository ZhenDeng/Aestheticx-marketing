import Image from "next/image";

interface BrandMarkProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

/**
 * The AestheticX brand icon — a gold app-icon mark. Rounded corners and
 * shadow are baked into the source art, so it renders as-is.
 */
export function BrandMark({ size = 44, className, priority }: BrandMarkProps) {
  return (
    <Image
      src="/logo-mark.png"
      alt="AestheticX"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
