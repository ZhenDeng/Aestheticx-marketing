// Centralised site facts.

// TODO: replace with the real App Store listing URL once the app is published.
export const APP_STORE_URL = "#app-store";

export const CONTACT_EMAIL = "info@aestheticxgroup.com";

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
