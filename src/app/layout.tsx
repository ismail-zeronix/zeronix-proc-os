import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { AppSplash } from "@/components/pwa/app-splash";
import { APPLE_STARTUP_IMAGES } from "@/lib/pwa";
import "./globals.css";

// Bundled, not next/font/google: the production Docker build broke when Google served it font URLs with query strings.
// Geist and Geist Mono are variable fonts (latin), SIL Open Font License, see fonts/OFL-LICENSE.txt.
const geistSans = localFont({ src: "./fonts/Geist-latin-wght.woff2", variable: "--font-sans", weight: "100 900" });
const geistMono = localFont({ src: "./fonts/GeistMono-latin-wght.woff2", variable: "--font-geist-mono", weight: "100 900" });
/** Seven-segment digits for the header clock (DSEG7 Classic, SIL Open Font License, see fonts/DSEG-LICENSE.txt). */
const digital = localFont({ src: "./fonts/DSEG7Classic-Bold.woff2", variable: "--font-dseg", display: "block" });

export const metadata: Metadata = {
  title: "Zeronix OS",
  description: "Zeronix portal: procurement, sales and more.",
  applicationName: "Zeronix OS",
  // installed on an iPhone: full screen under a see-through status bar (the header pads itself below it)
  appleWebApp: {
    capable: true,
    title: "Zeronix",
    statusBarStyle: "black-translucent",
    startupImage: APPLE_STARTUP_IMAGES,
  },
  // older iOS versions only read the apple- prefixed name
  other: { "apple-mobile-web-app-capable": "yes" },
  formatDetection: { telephone: false },
};

/** The browser bar and Android status bar take the colour of the header (white, or near-black in dark mode). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: the page shrinks above the keyboard, so the focused field and the bottom bar stay visible
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${digital.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <AppSplash />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
