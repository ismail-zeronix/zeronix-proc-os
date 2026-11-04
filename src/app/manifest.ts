import type { MetadataRoute } from "next";
import { PWA_BACKGROUND } from "@/lib/pwa";

/** What a phone or desktop browser needs to install the portal as an app (served at /manifest.webmanifest). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Zeronix OS",
    short_name: "Zeronix",
    description: "Zeronix business operating system: CRM, sales, procurement, accounts and more.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: PWA_BACKGROUND,
    theme_color: PWA_BACKGROUND,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
