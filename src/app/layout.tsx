import type { Metadata } from "next";
import { Fraunces, Albert_Sans, Fragment_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const albertSans = Albert_Sans({
  variable: "--font-albert",
  subsets: ["latin"],
  display: "swap",
});

const fragmentMono = Fragment_Mono({
  variable: "--font-fragment",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

// TODO: replace with the deployed production domain once known.
const SITE_URL = "https://aestheticx-marketing.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AestheticX — Practice software for Australian aesthetic medicine",
    template: "%s · AestheticX",
  },
  description:
    "AestheticX is an iOS app for Australian aesthetic-medicine practices: multi-role accounts, patient records, consent forms, the nurse-to-doctor treatment-authorisation workflow, appointments, teleconsults, and authorisation-based billing.",
  keywords: [
    "aesthetic clinic software",
    "cosmetic injector app",
    "AHPRA prescribing",
    "treatment authorisation",
    "consent forms",
    "Australian aesthetic medicine",
    "cosmetic nurse software",
  ],
  authors: [{ name: "AestheticX" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "AestheticX",
    title: "AestheticX — Practice software for Australian aesthetic medicine",
    description:
      "Patient records, consent forms, the nurse-to-doctor authorisation workflow, appointments, teleconsults, and authorisation-based billing — in one calm, precise iOS app.",
    url: SITE_URL,
    locale: "en_AU",
    // TODO: add a 1200x630 og-image.png to /public and reference it here.
  },
  twitter: {
    card: "summary_large_image",
    title: "AestheticX — Practice software for Australian aesthetic medicine",
    description:
      "A clinical instrument with the manner of a private atelier. Built for Australian aesthetic practices.",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-AU"
      className={`${fraunces.variable} ${albertSans.variable} ${fragmentMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
