// Draws the Zeronix OS app mark and writes every icon the installed app needs. Run once after changing the mark:
//   node scripts/make-app-icons.mjs
// The PNGs are committed, so the Docker build never runs this.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAVY = "#0B1220";
const MINT = "#35C7A5";
/** A step lighter than the navy, so the mark reads as a tile on the launch screen. */
const SURFACE = "#111C2E";

/** The geometric Z on a 100-unit grid, filling the box 0..100. */
const Z_PATH = "M0 0H100V20.5L29.5 79.5H100V100H0V79.5L70.5 20.5H0Z";

/**
 * The mark as SVG. `z` is the Z's width as a share of the canvas; `radius` rounds the navy square (0 = full bleed,
 * which iOS and Android masks expect).
 */
function markSvg(size, { z = 0.44, radius = 0.22, bg = NAVY } = {}) {
  const zs = size * z;
  const off = (size - zs) / 2;
  const r = size * radius;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${bg}"/>
  <path d="${Z_PATH}" fill="${MINT}" transform="translate(${off} ${off}) scale(${zs / 100})"/>
</svg>`;
}

async function png(svg, file) {
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
  console.log("wrote", file.replace(root, "."));
}

/** An .ico holding PNG images (supported by every current browser). */
async function ico(sizes, file) {
  const images = await Promise.all(sizes.map((s) => sharp(Buffer.from(markSvg(s, { z: 0.58, radius: 0.2 }))).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e);
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += img.length;
  });
  writeFileSync(file, Buffer.concat([header, ...images]));
  console.log("wrote", file.replace(root, "."));
}

const pub = (...p) => join(root, "public", ...p);
const app = (...p) => join(root, "src", "app", ...p);

// manifest icons
await png(markSvg(192), pub("icons", "icon-192.png"));
await png(markSvg(512), pub("icons", "icon-512.png"));
// maskable: full bleed, Z well inside the 80% safe circle
await png(markSvg(512, { z: 0.38, radius: 0 }), pub("icons", "icon-maskable-512.png"));
// iOS rounds the corners itself
await png(markSvg(180, { radius: 0 }), app("apple-icon.png"));
// browser tab
writeFileSync(app("icon.svg"), markSvg(64, { z: 0.58, radius: 0.2 }));
console.log("wrote ./src/app/icon.svg");
await ico([16, 32, 48], app("favicon.ico"));
// reusable mark (login card, in-app splash)
writeFileSync(pub("icons", "zeronix-mark.svg"), markSvg(512));
console.log("wrote ./public/icons/zeronix-mark.svg");

// iOS launch images: navy screen with the mark in the middle (no text, so no font is needed)
const splash = JSON.parse(readFileSync(join(root, "src", "lib", "pwa-splash.json"), "utf8"));
for (const { w, h, r } of splash) {
  const W = w * r;
  const H = h * r;
  const m = Math.round(W * 0.24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <g transform="translate(${(W - m) / 2} ${(H - m) / 2 - H * 0.04})">${markSvg(m, { bg: SURFACE }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>
</svg>`;
  await png(svg, pub("splash", `apple-splash-${W}x${H}.png`));
}
