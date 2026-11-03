import type { MetadataRoute } from "next";

/** Web app manifest: the name and icons used when someone adds the site to a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zeronix Tech · Business IT, matched to your industry",
    short_name: "Zeronix Tech",
    description: "UAE-stock laptops, desktops, workstations and servers for business, with B2B pricing.",
    start_url: "/",
    display: "browser",
    background_color: "#F6F6F1",
    theme_color: "#03201A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
