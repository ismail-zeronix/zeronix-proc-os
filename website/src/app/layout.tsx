import { GoogleAnalytics, GoogleTagManager } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Tracker } from "@/components/analytics/tracker";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { getNav, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { flags } from "@/lib/flags";
import { JsonLd } from "@/components/catalog/page-parts";
import { siteJsonLd } from "@/lib/seo";
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
    publisher: brand.name,
    category: "technology",
    formatDetection: { telephone: false, email: false, address: false },
    alternates: { types: { "application/rss+xml": [{ url: "/rss.xml", title: `${brand.name} guides and articles` }] } },
    openGraph: { type: "website", siteName: brand.name, locale: "en_AE" },
    twitter: { card: "summary_large_image" },
    robots: flags.indexing ? { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } : { index: false, follow: false },
    // Search Console and Bing Webmaster Tools ownership checks (website/SEO-PLAN.md, owner steps)
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
      other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
    },
  };
}

// Google Analytics 4 (the Google tag, gtag.js), loaded after the page is interactive. Live site only (SITE_INDEXING=true),
// so local and test visits never reach the real property. GA_MEASUREMENT_ID can replace the id without a code change.
const GA_ID = process.env.GA_MEASUREMENT_ID || "G-MZWP8C8GLW";
// Google Tag Manager container (one per page, at the top as Google asks). GA4 stays on its own tag above: the container
// does not hold the GA4 tag, so nothing is counted twice. If GA4 is ever added inside GTM, remove GoogleAnalytics below.
const GTM_ID = process.env.GTM_ID || "GTM-PJ5JPS9P";

export const viewport: Viewport = {
  themeColor: "#f7f8fa",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ brand, home }, nav] = await Promise.all([getSettings(), getNav()]);
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      {flags.indexing && GTM_ID && <GoogleTagManager gtmId={GTM_ID} />}
      <body className="flex min-h-dvh flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-cta focus:px-3 focus:py-2 focus:text-brand-950">
          Skip to content
        </a>
        <Header brand={brand} home={home} nav={nav} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer brand={brand} nav={nav} services={home.services} />
        <JsonLd data={siteJsonLd(brand)} />
        <Tracker />
        {/* the portal's chat widget (the portal's widget/README.md), in the brand colours; chats are tagged with this site */}
        {process.env.PORTAL_PUBLIC_URL && (
          <script
            src={`${process.env.PORTAL_PUBLIC_URL.replace(/\/$/, "")}/widget/zeronix-chat.js`}
            data-color="#0F2747"
            data-dark="#081A31"
            data-title={`${brand.name} sales`}
            data-greeting={`Hi 👋 Welcome to ${brand.name}. Tell us what your team does, or which models you are looking at, and we will send B2B pricing.`}
            data-quick={`${brand.ctaLabel}|Which laptop suits my team?|Talk to a sales person`}
            data-popup-delay="45"
            data-popup-scroll="70"
            defer
          />
        )}
      </body>
      {flags.indexing && GA_ID && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}
