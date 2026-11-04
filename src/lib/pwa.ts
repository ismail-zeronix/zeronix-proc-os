import splash from "./pwa-splash.json";

/** Navy of the app icon, launch screen and offline page (scripts/make-app-icons.mjs uses the same values). */
export const PWA_BACKGROUND = "#0B1220";
export const PWA_ACCENT = "#35C7A5";

/**
 * iOS launch images, one per iPhone screen (portrait). The files are made by scripts/make-app-icons.mjs from the same
 * list (src/lib/pwa-splash.json); iOS picks the one whose media query matches, otherwise it shows a blank screen.
 */
export const APPLE_STARTUP_IMAGES = (splash as { w: number; h: number; r: number }[]).map(({ w, h, r }) => ({
  url: `/splash/apple-splash-${w * r}x${h * r}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));
