import type { Icon } from "@phosphor-icons/react";
import { ClipboardText, Cpu, Desktop, HardDrives, Key, Keyboard, Laptop, Monitor, Package, SquaresFour, Wrench } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

/** One category entry for the home page (a category, or a brand within a category, "Dell desktops"). */
export interface CategoryCardData {
  href: string;
  title: string;
  /** Live product count; 0 means on request. */
  count: number;
  /** A real product picture from that category (not shown on the home strip, which uses icons). */
  image?: string;
  /** The category site icon name. */
  icon: string;
  kind: "category" | "brand";
}

/** Phosphor duotone icons for the category icon names the portal uses. */
const ICONS: Record<string, Icon> = {
  laptop: Laptop,
  monitor: Desktop,
  cpu: Cpu,
  server: HardDrives,
  presentation: Monitor,
  keyboard: Keyboard,
  "key-round": Key,
};

/** A category icon by the portal icon name (Phosphor duotone), for icon tiles elsewhere on the site. */
export function CategoryGlyph({ icon, className }: { icon: string; className?: string }) {
  const Glyph = ICONS[icon] ?? Package;
  return <Glyph weight="duotone" className={className} />;
}

interface Tile {
  href: string;
  label: string;
  Glyph: Icon;
}

/**
 * "Shop by category" as icon circles (no photos), the noon.com pattern. Phones: two rows of five, swipe for more.
 * Desktop: one strip with dividers, larger rounded tiles (the owner reference). After the categories come "All products", "IT services" and "Bulk quote".
 */
export function CategoryIcons({ cards, ctaLabel }: { cards: CategoryCardData[]; ctaLabel: string }) {
  const tiles: Tile[] = [
    ...cards.filter((c) => c.kind === "category").map((c) => ({ href: c.href, label: c.title, Glyph: ICONS[c.icon] ?? Package })),
    { href: "/products", label: "All products", Glyph: SquaresFour },
    { href: "/services", label: "IT services", Glyph: Wrench },
    { href: "/quote", label: ctaLabel.length > 14 ? "Bulk quote" : ctaLabel, Glyph: ClipboardText },
  ];
  return (
    <ul
      aria-label="Product categories"
      className="-mx-3 grid auto-cols-[calc((100%-4*0.25rem)/5)] grid-flow-col grid-rows-2 gap-x-1 gap-y-3 overflow-x-auto px-3 [scrollbar-width:none] sm:-mx-5 sm:auto-cols-[5.5rem] sm:px-5 lg:mx-0 lg:auto-cols-fr lg:grid-rows-1 lg:gap-x-0 lg:divide-x lg:divide-line lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {tiles.map((t) => (
        <li key={t.href}>
          <Link href={t.href} className="group flex flex-col items-center gap-1.5 text-center lg:gap-2.5 lg:px-1 lg:py-1.5" data-track="home-category">
            <span className="grid size-14 place-items-center rounded-full bg-surface text-brand-900 transition-colors duration-200 group-hover:bg-brand-900 group-hover:text-white sm:size-16 lg:size-[4.5rem] lg:rounded-2xl xl:size-20">
              <t.Glyph weight="duotone" className="size-7 sm:size-8 lg:size-9 xl:size-10" />
            </span>
            <span className="line-clamp-2 text-[0.6875rem] leading-tight font-medium text-ink group-hover:text-brand-900 sm:text-xs lg:text-[0.8125rem] lg:font-semibold xl:text-sm">{t.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
