import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Tracker } from "@/components/analytics/tracker";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { getNav, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { flags } from "@/lib/flags";
import "./globals.css";

// BRAND.md section 3. Self-hosted (next/font/google fails in the server's Docker build); variable fonts, SIL OFL.
const body = localFont({ src: "./fonts/Figtree-latin-wght.woff2", variable: "--font-body", weight: "300 900", display: "swap" });
const display = localFont({ src: "./fonts/Manrope-latin-wght.woff2", variable: "--font-display", weight: "200 800", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getSettings();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${brand.name} · ${brand.tagline}`, template: `%s · ${brand.name}` },
    description: brand.subline,
    applicationName: brand.name,
    openGraph: { type: "website", siteName: brand.name, locale: "en_AE" },
    robots: flags.indexing ? undefined : { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#f6f6f1",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ brand, home }, nav] = await Promise.all([getSettings(), getNav()]);
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-lime-400 focus:px-3 focus:py-2 focus:text-forest-950">
          Skip to content
        </a>
        <Header brand={brand} home={home} nav={nav} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer brand={brand} nav={nav} services={home.services} />
        <Tracker />
        {/* the portal's chat widget (the portal's widget/README.md), in the brand colours; chats are tagged with this site */}
        {process.env.PORTAL_PUBLIC_URL && (
          <script
            src={`${process.env.PORTAL_PUBLIC_URL.replace(/\/$/, "")}/widget/zeronix-chat.js`}
            data-color="#06352B"
            data-dark="#03201A"
            data-title={`${brand.name} sales`}
            data-greeting={`Hi 👋 Welcome to ${brand.name}. Tell us what your team does, or which models you are looking at, and we will send B2B pricing.`}
            data-quick={`${brand.ctaLabel}|Which laptop suits my team?|Talk to a sales person`}
            data-popup-delay="45"
            data-popup-scroll="70"
            defer
          />
        )}
      </body>
    </html>
  );
}
