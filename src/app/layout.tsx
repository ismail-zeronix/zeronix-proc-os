import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
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
