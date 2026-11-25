import "server-only";
import { eq } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import type { SiteIcon } from "./contract";
import type { SiteSpecTemplate } from "./types";

/**
 * The categories the SEO audit (2026-11-25) asked for that the live site does not have yet: Networking, and
 * Video conferencing with its six kinds of meeting-room hardware (our highest search demand). An admin adds them once
 * from Website › Categories; the buying copy, specs to compare and questions for these pages live in the site's code
 * (website/src/lib/seo-categories.ts). Categories already there are left as they are, so pressing it twice changes
 * nothing. The spec template's first three fields are the "key specs" on each product card and in the comparison
 * table, in the same order as the table's columns on the site.
 */

const group = (label: string, fields: [string, string, boolean?][]) => ({ label, fields: fields.map(([key, l, filter]) => ({ key, label: l, filter })) });
const warranty = group("Warranty", [["warranty", "Warranty"]]);
const tpl = (g: ReturnType<typeof group>[]): SiteSpecTemplate => ({ groups: [...g, warranty] });

type Row = { slug: string; name: string; icon: SiteIcon; description: string; specTemplate: SiteSpecTemplate; parent?: string };

const CATEGORIES: Row[] = [
  {
    slug: "networking",
    name: "Networking",
    icon: "network",
    description: "Managed switches, Wi-Fi access points, routers and firewalls for offices, supplied and installed.",
    specTemplate: tpl([group("Product", [["type", "Type", true], ["ports", "Ports", true], ["speed", "Speed", true], ["poe", "PoE"], ["wifi", "Wi-Fi standard", true], ["management", "Management", true]])]),
  },
  {
    slug: "video-conferencing",
    name: "Video conferencing and meeting rooms",
    icon: "presentation",
    description: "Cameras, speakerphones, room kits, wireless presentation, displays and control panels for Teams and Zoom rooms.",
    specTemplate: tpl([group("Room", [["type", "Type", true], ["room_size", "Room size", true], ["platform", "Platform", true], ["connection", "Connection"]])]),
  },
  {
    slug: "conference-cameras",
    name: "Conference cameras",
    icon: "cctv",
    parent: "video-conferencing",
    description: "4K, PTZ and auto-framing cameras for huddle rooms to boardrooms.",
    specTemplate: tpl([group("Camera", [["resolution", "Resolution", true], ["field_of_view", "Field of view", true], ["zoom", "Zoom", true], ["tracking", "Auto-framing / tracking"], ["connection", "Connection", true], ["platform", "Certified for", true]])]),
  },
  {
    slug: "conference-audio",
    name: "Speakerphones and conference audio",
    icon: "headphones",
    parent: "video-conferencing",
    description: "Speakerphones, table and ceiling microphones for clear calls in every seat.",
    specTemplate: tpl([group("Audio", [["type", "Type", true], ["pickup_range", "Pickup range", true], ["connection", "Connection", true], ["microphones", "Microphones"], ["platform", "Certified for", true]])]),
  },
  {
    slug: "room-kits",
    name: "All-in-one room kits",
    icon: "users",
    parent: "video-conferencing",
    description: "Video bars and Teams Rooms or Zoom Rooms kits with a touch panel.",
    specTemplate: tpl([group("Kit", [["room_size", "Room size", true], ["camera", "Camera", true], ["platform", "Platform", true], ["audio", "Audio"], ["in_box", "In the box"]])]),
  },
  {
    slug: "wireless-presentation",
    name: "Wireless presentation and BYOD",
    icon: "wifi",
    parent: "video-conferencing",
    description: "Share laptops and phones to the room screen without cables; BYOD for any meeting platform.",
    specTemplate: tpl([group("Sharing", [["sharing_method", "Sharing method", true], ["sources", "Simultaneous sources", true], ["resolution", "Resolution", true], ["byod", "BYOD conferencing"], ["platforms", "Works with"]])]),
  },
  {
    slug: "meeting-room-displays",
    name: "Meeting room displays",
    icon: "monitor",
    parent: "video-conferencing",
    description: "Commercial 4K and interactive displays sized for each room.",
    specTemplate: tpl([group("Display", [["size", "Size", true], ["resolution", "Resolution", true], ["brightness", "Brightness"], ["duty", "Duty rating"], ["touch", "Touch", true], ["inputs", "Inputs"]])]),
  },
  {
    slug: "room-control-panels",
    name: "Room control panels",
    icon: "presentation",
    parent: "video-conferencing",
    description: "Touch controllers on the table and booking panels at the door.",
    specTemplate: tpl([group("Panel", [["platform", "Platform", true], ["screen_size", "Screen size", true], ["mounting", "Mounting", true], ["use", "Use", true], ["power", "Power"]])]),
  },
];

/** Adds the categories that are missing (published, after the existing ones) and says how many were new. */
export async function addSeoCategories(): Promise<{ categories: number }> {
  const C = siteSchema.siteCategories;
  const existing = await siteDb.select({ slug: C.slug, sort: C.sort }).from(C);
  const have = new Set(existing.map((r) => r.slug));
  let sort = Math.max(0, ...existing.map((r) => r.sort)) + 1;
  let added = 0;
  // parents first, so the kinds can point at them
  for (const row of [...CATEGORIES.filter((c) => !c.parent), ...CATEGORIES.filter((c) => c.parent)]) {
    if (have.has(row.slug)) continue;
    const [parent] = row.parent ? await siteDb.select({ id: C.id }).from(C).where(eq(C.slug, row.parent)) : [];
    const inserted = await siteDb
      .insert(C)
      .values({ slug: row.slug, name: row.name, icon: row.icon, description: row.description, specTemplate: row.specTemplate, parentId: parent?.id ?? null, sort: sort++, status: "published" })
      .onConflictDoNothing({ target: C.slug })
      .returning({ id: C.id });
    added += inserted.length;
  }
  return { categories: added };
}

/** The slugs it adds (the Website › Categories button shows while any is missing). */
export const SEO_CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);
