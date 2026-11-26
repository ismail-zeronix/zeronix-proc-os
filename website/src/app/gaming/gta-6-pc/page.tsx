import type { Metadata } from "next";
import { gameFaq, GamePageView, type SpecRow } from "@/components/gaming/game-page";
import { getSettings } from "@/lib/api";
import { GTA6 } from "@/lib/gaming";
import { loadBuilds } from "@/lib/gaming-data";

export const revalidate = 600;

/**
 * "GTA 6 PC" is the biggest gaming search of the moment (owner 2026-11-22: build the hype, and the SEO). Wording rule:
 * "GTA VI Ready" and "predicted", never "officially supported": Rockstar has not published PC requirements (checked
 * 2026-11-22; reports point to early 2027 for the PC release). Update GAMES in lib/gaming.ts when they do.
 */
export const metadata: Metadata = {
  title: { absolute: "GTA 6 PC Requirements & GTA VI Ready Gaming PCs in UAE | Zeronix Tech" },
  description: "Predicted GTA 6 PC requirements for 1080p, 1440p and 4K, the estimated FPS of every Zeronix Custom PC, and the build we recommend. Delivered across the UAE.",
  alternates: { canonical: "/gaming/gta-6-pc" },
};

const SPECS: SpecRow[] = [
  { tier: "Minimum · 1080p", cpu: "6 cores: Ryzen 5 5600 / Core i5-12400", gpu: "8GB: RTX 3060 / RX 6600 XT", ram: "16GB", storage: "150GB NVMe SSD" },
  { tier: "Recommended · 1440p", cpu: "8 cores: Ryzen 7 9700X / Core Ultra 7 265K", gpu: "12GB: RTX 5070 / RX 9070", ram: "32GB DDR5", storage: "150GB+ NVMe SSD" },
  { tier: "Ultra · 4K", cpu: "Ryzen 7 9800X3D", gpu: "16GB+: RTX 5080 / RTX 5090", ram: "32-64GB DDR5", storage: "150GB+ NVMe Gen4" },
];

export default async function Gta6Page() {
  const [{ brand }, builds] = await Promise.all([getSettings(), loadBuilds()]);
  const faq = [
    { q: "When is GTA 6 coming to PC?", a: "GTA VI came out on PS5 and Xbox Series X|S on 19 November 2026. Rockstar has not announced a PC date yet; industry reports point to 2027. We update this page as soon as it is confirmed." },
    { q: "What are the GTA 6 PC requirements?", a: "Rockstar has not published them yet. Our prediction: a 6-core processor, an 8GB graphics card such as the RTX 3060 and 16GB of RAM for 1080p, and an 8-core processor with an RTX 5070-class card and 32GB for 1440p High. Plan for at least 150GB on an NVMe SSD." },
    { q: "Is 16GB of RAM enough for GTA 6?", a: "Probably for 1080p, but 32GB is the safer choice for a game this size, especially if you stream or keep Discord and a browser open. Every Zeronix build from the Havoc up has 32GB DDR5." },
    ...gameFaq(GTA6, builds).slice(0, 1),
    { q: "Can I buy a PC now and upgrade later for GTA 6?", a: "Yes. Every Zeronix build is on AMD's AM5 platform with a power supply that leaves headroom, so a faster processor or graphics card can go in later." },
  ];
  return (
    <GamePageView
      game={GTA6}
      heading="GTA 6 Ready PCs: GTA VI PC requirements and FPS"
      builds={builds}
      ctaLabel={brand.ctaLabel}
      intro="GTA VI is out on PS5 and Xbox, and the PC version is expected in 2027. Rockstar has not published PC requirements yet, so here is what we expect it to need, how each Zeronix Custom PC should run it, and the build we would pick today."
      specs={SPECS}
      faq={faq}
    />
  );
}
