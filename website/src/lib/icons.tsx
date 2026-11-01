import { createElement } from "react";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  Circle,
  Clapperboard,
  Cpu,
  GraduationCap,
  HardHat,
  Headset,
  Hotel,
  Landmark,
  Laptop,
  Monitor,
  PackageCheck,
  PenTool,
  Receipt,
  Scale,
  Server,
  ShieldCheck,
  ShoppingBag,
  Stethoscope,
  Truck,
  Zap,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { SiteIcon } from "./contract";

/** The icon names editors pick in the portal (SITE_ICONS) as components; unknown or empty names get a plain dot. */
const ICONS: Record<SiteIcon, LucideIcon> = {
  building: Building2,
  "pen-tool": PenTool,
  "hard-hat": HardHat,
  scale: Scale,
  stethoscope: Stethoscope,
  landmark: Landmark,
  "graduation-cap": GraduationCap,
  hotel: Hotel,
  truck: Truck,
  clapperboard: Clapperboard,
  "shopping-bag": ShoppingBag,
  briefcase: Briefcase,
  laptop: Laptop,
  monitor: Monitor,
  cpu: Cpu,
  server: Server,
  "shield-check": ShieldCheck,
  "badge-check": BadgeCheck,
  headset: Headset,
  "package-check": PackageCheck,
  receipt: Receipt,
  zap: Zap,
};

export const iconFor = (name: string): LucideIcon => ICONS[name as SiteIcon] ?? Circle;

/** Renders an editor-picked icon by name (keeps dynamic component lookups out of render bodies). */
export function SiteIconView({ name, ...props }: { name: string } & LucideProps) {
  return createElement(iconFor(name), props);
}
