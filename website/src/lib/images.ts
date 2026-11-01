import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Site images by name ("hero", "industry-real-estate", "category-laptops"): files in public/images, made by the
 * portal's scripts/site-images.ts or dropped in by hand. A name with no file gives undefined, and the Photo component
 * shows its labelled slot instead. Looked up once per process.
 */
const DIR = path.join(process.cwd(), "public", "images");
const found = new Map<string, string | undefined>();

export function imageFor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (!found.has(name)) {
    const ext = ["webp", "jpg", "png"].find((e) => existsSync(path.join(DIR, `${name}.${e}`)));
    found.set(name, ext ? `/images/${name}.${ext}` : undefined);
  }
  return found.get(name);
}
