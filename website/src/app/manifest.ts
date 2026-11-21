import type { MetadataRoute } from "next";

/** Web app manifest: the site installs as an app on phones (bottom tab bar, standalone window, shortcuts). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Zeronix Tech · Business IT store",
    short_name: "Zeronix",
    description: "UAE-stock laptops, desktops, workstations and servers for business, with B2B pricing.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f9d58",
    categories: ["shopping", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop products", url: "/products", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Cart", url: "/cart", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Get B2B pricing", url: "/quote", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
