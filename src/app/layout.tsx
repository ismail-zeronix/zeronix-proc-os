import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";

// Bundled, not next/font/google: the production Docker build broke when Google served it font URLs with query strings.
// Geist and Geist Mono are variable fonts (latin), SIL Open Font License, see fonts/OFL-LICENSE.txt.
const geistSans = localFont({ src: "./fonts/Geist-latin-wght.woff2", variable: "--font-sans", weight: "100 900" });
const geistMono = localFont({ src: "./fonts/GeistMono-latin-wght.woff2", variable: "--font-geist-mono", weight: "100 900" });
/** Seven-segment digits for the header clock (DSEG7 Classic, SIL Open Font License, see fonts/DSEG-LICENSE.txt). */
const digital = localFont({ src: "./fonts/DSEG7Classic-Bold.woff2", variable: "--font-dseg", display: "block" });

export const metadata: Metadata = {
  title: "Zeronix",
  description: "Zeronix portal: procurement, sales and more.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${digital.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
