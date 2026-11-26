import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { WebMcp } from "@/components/agent/web-mcp";
import { Tracker } from "@/components/analytics/tracker";
import { Footer } from "@/components/layout/footer";
import { BottomBar } from "@/components/layout/bottom-bar";
import { Header } from "@/components/layout/header";
import { SwRegister } from "@/components/layout/sw-register";
import { getNav, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { flags } from "@/lib/flags";
import { JsonLd } from "@/components/catalog/page-parts";
import { siteJsonLd } from "@/lib/seo";
import "./globals.css";

// One family for everything (Inter, self-hosted: next/font/google fails in the server's Docker build); variable, SIL OFL.
const body = localFont({ src: "./fonts/Inter-latin-wght.woff2", variable: "--font-body", weight: "100 900", display: "swap" });
const display = localFont({ src: "./fonts/Inter-latin-wght.woff2", variable: "--font-display", weight: "100 900", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getSettings();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${brand.name} · ${brand.tagline}`, template: `%s · ${brand.name}` },
    description: brand.subline,
    applicationName: brand.name,
    // added to the home screen it opens like an app (manifest.ts); iOS reads these instead of the manifest
    appleWebApp: { capable: true, title: "Zeronix", statusBarStyle: "default" },
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
  themeColor: "#ffffff",
  // the app runs edge to edge on notched phones; the header and the tab bar pad themselves with the safe areas
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ brand, home }, nav] = await Promise.all([getSettings(), getNav()]);
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="flex min-h-dvh flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))] font-sans lg:pb-0">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-cta focus:px-3 focus:py-2 focus:text-on-brand">
          Skip to content
        </a>
        <Header brand={brand} home={home} nav={nav} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer brand={brand} nav={nav} services={home.services} />
        <BottomBar />
        <SwRegister />
        <JsonLd data={siteJsonLd(brand)} />
        <Tracker />
        <WebMcp />
        {/* the portal's chat widget (the portal's widget/README.md), in the brand colours; chats are tagged with this site */}
        {process.env.PORTAL_PUBLIC_URL && (
          <Script
            strategy="lazyOnload"
            src={`${process.env.PORTAL_PUBLIC_URL.replace(/\/$/, "")}/widget/zeronix-chat.js`}
            data-color="#0a8443"
            data-dark="#087236"
            data-title={`${brand.name} sales`}
            data-greeting={`Hi 👋 Welcome to ${brand.name}. Tell us what your team does, or which models you are looking at, and we will send B2B pricing.`}
            data-quick={`${brand.ctaLabel}|Which laptop suits my team?|Talk to a sales person`}
            data-popup-delay="45"
            data-popup-scroll="70"
          />
        )}
        {/* Google Tag Manager and Google Analytics 4 are ~360 KB of script: they load once the page has finished loading
            (lazyOnload), never in the way of the first screen. Same ids and tags as before. */}
        {flags.indexing && GTM_ID && (
          <Script id="gtm" strategy="lazyOnload">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        )}
        {flags.indexing && GA_ID && (
          <>
            <Script id="ga" strategy="lazyOnload">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`}
            </Script>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="lazyOnload" />
          </>
        )}
      </body>
    </html>
  );
}
