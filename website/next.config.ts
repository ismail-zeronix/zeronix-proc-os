import path from "node:path";
import type { NextConfig } from "next";

// This folder is the whole app. Without this, Next.js sees the portal's package-lock.json one level up, takes the
// repository as the root and pulls in the portal's files.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  // The Docker build sets NEXT_OUTPUT=standalone (small image, `node server.js`); local builds stay normal.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  images: {
    // Phones get pictures sized for them (no 2048/3840 steps), product shots at quality 60 (hard to tell from 75 on a
    // white tile, ~30% smaller). Optimised copies are kept a week; a replaced picture gets a new /media id anyway.
    deviceSizes: [390, 640, 828, 1080, 1280, 1920],
    imageSizes: [48, 96, 128, 256, 320],
    qualities: [60, 75],
    minimumCacheTTL: 604800,
  },
  experimental: {
    // Pages already opened stay in the browser's page cache for a minute, so going back and forth is instant.
    staleTimes: { dynamic: 60, static: 300 },
  },
  async headers() {
    return [
      // the service worker must never be served stale, or an old one keeps running after a release
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
