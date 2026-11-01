import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import type { SiteIcon } from "./contract";
import { renderMarkdown } from "./markdown";
import { INDUSTRY_CONTENT } from "./starter-content";
import type { SiteSpecTemplate } from "./types";

/**
 * The first industries, categories and brands of zeronixtech.com, added when an admin presses "Add starter catalog".
 * They are real content (the owner's target markets), published and fully editable afterwards; rows whose slug already
 * exists are left as they are, so pressing it twice changes nothing.
 */

const INDUSTRIES: { slug: string; name: string; icon: SiteIcon; summary: string }[] = [
  { slug: "real-estate", name: "Real estate", icon: "building", summary: "Light, long-battery laptops for agents on the move and CRM-ready office desktops." },
  { slug: "architecture-design", name: "Architecture & design", icon: "pen-tool", summary: "Certified workstations and colour-accurate displays for CAD, BIM and rendering." },
  { slug: "engineering-construction", name: "Engineering & construction", icon: "hard-hat", summary: "Tough laptops for site teams and workstations for the design office." },
  { slug: "legal", name: "Legal", icon: "scale", summary: "Secure, quiet business laptops with long warranties for document-heavy work." },
  { slug: "healthcare", name: "Healthcare & clinics", icon: "stethoscope", summary: "Reliable desktops for reception and consultation rooms, secure laptops for doctors." },
  { slug: "finance-accounting", name: "Finance & accounting", icon: "landmark", summary: "Multi-monitor desktops and hardened laptops for finance teams." },
  { slug: "education", name: "Education", icon: "graduation-cap", summary: "Durable laptops for classrooms and staff, easy to manage at scale." },
  { slug: "hospitality", name: "Hospitality", icon: "hotel", summary: "Front-desk PCs, back-office desktops and servers for hotels and restaurants." },
  { slug: "logistics-trading", name: "Logistics & trading", icon: "truck", summary: "Laptops for warehouse offices and servers for ERP and inventory." },
  { slug: "media-production", name: "Media & production", icon: "clapperboard", summary: "Creator workstations for editing, motion graphics and 3D." },
  { slug: "retail", name: "Retail", icon: "shopping-bag", summary: "Point-of-sale desktops and back-office systems for shops and chains." },
  { slug: "corporate-offices", name: "Corporate offices", icon: "briefcase", summary: "Standard laptops and desktops for growing teams, set up the same way." },
];

const group = (label: string, fields: [string, string, boolean?][]) => ({ label, fields: fields.map(([key, l, filter]) => ({ key, label: l, filter })) });

const PC_SPECS: SiteSpecTemplate = {
  groups: [
    group("Performance", [["processor", "Processor", true], ["memory", "Memory", true], ["storage", "Storage", true], ["graphics", "Graphics", true]]),
    group("Display", [["display", "Display", true]]),
    group("Connectivity", [["ports", "Ports"], ["wireless", "Wireless"]]),
    group("Software & security", [["os", "Operating system", true], ["security", "Security"]]),
    group("Warranty", [["warranty", "Warranty"]]),
  ],
};

const LAPTOP_SPECS: SiteSpecTemplate = {
  groups: [
    ...PC_SPECS.groups.slice(0, 2),
    group("Build & battery", [["weight", "Weight", true], ["battery", "Battery"], ["dimensions", "Dimensions"]]),
    ...PC_SPECS.groups.slice(2),
  ],
};

const SERVER_SPECS: SiteSpecTemplate = {
  groups: [
    group("Platform", [["form_factor", "Form factor", true], ["processor", "Processor", true], ["sockets", "Sockets"]]),
    group("Memory & storage", [["memory", "Memory", true], ["max_memory", "Max memory"], ["storage", "Storage"], ["drive_bays", "Drive bays"], ["raid", "RAID"]]),
    group("Network & power", [["network", "Network"], ["power", "Power supply"]]),
    group("Management", [["management", "Remote management"], ["os", "Operating system"]]),
    group("Warranty", [["warranty", "Warranty"]]),
  ],
};

const CATEGORIES: { slug: string; name: string; icon: SiteIcon; description: string; specTemplate: SiteSpecTemplate }[] = [
  { slug: "laptops", name: "Business laptops", icon: "laptop", description: "Thin, secure business series for every role, from agents to engineers.", specTemplate: LAPTOP_SPECS },
  { slug: "desktops", name: "Desktops", icon: "monitor", description: "Compact and tower desktops for offices, front desks and finance teams.", specTemplate: PC_SPECS },
  { slug: "workstations", name: "Workstations", icon: "cpu", description: "Certified mobile and tower workstations for CAD, BIM, 3D and video.", specTemplate: PC_SPECS },
  { slug: "servers", name: "Servers", icon: "server", description: "Tower and rack servers for file sharing, ERP and virtualisation.", specTemplate: SERVER_SPECS },
];

const BRANDS: { slug: string; name: string; website: string }[] = [
  { slug: "hp", name: "HP", website: "https://www.hp.com/ae-en/" },
  { slug: "dell", name: "Dell", website: "https://www.dell.com/en-ae" },
  { slug: "lenovo", name: "Lenovo", website: "https://www.lenovo.com/ae/en/" },
  { slug: "apple", name: "Apple", website: "https://www.apple.com/ae/" },
  { slug: "asus", name: "ASUS", website: "https://www.asus.com/ae-en/" },
  { slug: "microsoft", name: "Microsoft", website: "https://www.microsoft.com/en-ae/surface/business" },
];

/**
 * Gives industry pages that are still empty (no intro, no roles, no FAQ) the starter copy from starter-content.ts.
 * Pages someone has written anything on are left alone. Returns how many pages were filled.
 */
export async function fillEmptyIndustryPages(): Promise<number> {
  const empty = await siteDb
    .select({ id: siteSchema.siteIndustries.id, slug: siteSchema.siteIndustries.slug, heroTitle: siteSchema.siteIndustries.heroTitle })
    .from(siteSchema.siteIndustries)
    .where(and(eq(siteSchema.siteIndustries.intro, ""), sql`${siteSchema.siteIndustries.roles} = '[]'::jsonb`, sql`${siteSchema.siteIndustries.faq} = '[]'::jsonb`));
  let filled = 0;
  for (const row of empty) {
    const c = INDUSTRY_CONTENT[row.slug];
    if (!c) continue;
    await siteDb
      .update(siteSchema.siteIndustries)
      .set({ heroTitle: row.heroTitle || c.heroTitle, intro: c.intro, introHtml: renderMarkdown(c.intro), painPoints: c.painPoints, roles: c.roles, faq: c.faq, updatedAt: new Date() })
      .where(eq(siteSchema.siteIndustries.id, row.id));
    filled++;
  }
  return filled;
}

/** Adds what is missing and says how many rows of each were new. */
export async function addStarterCatalog(): Promise<{ industries: number; categories: number; brands: number }> {
  const industries = await siteDb
    .insert(siteSchema.siteIndustries)
    .values(INDUSTRIES.map((x, i) => ({ ...x, sort: i, status: "published" as const })))
    .onConflictDoNothing({ target: siteSchema.siteIndustries.slug })
    .returning({ id: siteSchema.siteIndustries.id });
  const categories = await siteDb
    .insert(siteSchema.siteCategories)
    .values(CATEGORIES.map((x, i) => ({ ...x, sort: i, status: "published" as const })))
    .onConflictDoNothing({ target: siteSchema.siteCategories.slug })
    .returning({ id: siteSchema.siteCategories.id });
  const brands = await siteDb
    .insert(siteSchema.siteBrands)
    .values(BRANDS.map((x, i) => ({ ...x, sort: i, status: "published" as const })))
    .onConflictDoNothing({ target: siteSchema.siteBrands.slug })
    .returning({ id: siteSchema.siteBrands.id });
  return { industries: industries.length, categories: categories.length, brands: brands.length };
}
