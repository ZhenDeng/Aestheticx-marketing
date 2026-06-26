// Centralised, clearly-marked placeholders. Fill these in before going live.

// TODO: replace with the real App Store listing URL.
export const APP_STORE_URL = "#app-store";

// TODO: replace with the real contact email.
export const CONTACT_EMAIL = "hello@aestheticx.com.au";

export const PRODUCT_NAME = "AestheticX";

// Primary navigation: role subpages + homepage anchors.
// Leading "/" links resolve from any page; "/#id" jumps to a homepage section.
export const NAV_LINKS = [
  { href: "/for-doctors", label: "Doctors" },
  { href: "/for-nurses", label: "Nurses" },
  { href: "/for-clinics", label: "Clinics" },
  { href: "/#features", label: "Features" },
  { href: "/#faq", label: "FAQ" },
  { href: "/login", label: "Log in" },
] as const;
