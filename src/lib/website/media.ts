import "server-only";
import path from "node:path";
import { fileStore } from "@/lib/files-store";

/** The website's pictures, on their own volume (SITE_FILES_DIR) and listed in site_media, apart from the Files app. */
export const SITE_FILES_DIR = path.resolve(process.env.SITE_FILES_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data", "site-media"));

export const siteFiles = fileStore(SITE_FILES_DIR);
