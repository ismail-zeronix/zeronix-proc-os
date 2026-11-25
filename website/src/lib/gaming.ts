/**
 * The Gaming section (/gaming, owner 2026-11-22): which categories count as gaming, the Zeronix Custom PC tiers and the
 * games list with estimated frame rates. Products, prices and specs stay in the catalog (Website › Products); this file
 * only adds what the catalog has no field for: a build's tier and bars, and each game's demands and FPS per build.
 *
 * Every FPS figure is an ESTIMATE (High preset, native resolution, no upscaling unless the game says so), worked out
 * from public benchmarks of the same CPU and graphics card. GTA VI has no PC version or official requirements yet,
 * so its numbers are a prediction and the page says so.
 */

/** Categories shown under Gaming (category bar, /gaming) instead of with the business categories. */
export const GAMING_CATEGORIES: { slug: string; name: string; short: string; glyph: "desktop" | "laptop" | "monitor" | "gpu" | "headset" }[] = [
  { slug: "gaming-pcs", name: "Gaming PCs", short: "Gaming PCs", glyph: "desktop" },
  { slug: "gaming-laptops", name: "Gaming laptops", short: "Laptops", glyph: "laptop" },
  { slug: "gaming-monitors", name: "Gaming monitors", short: "Monitors", glyph: "monitor" },
  { slug: "graphics-cards", name: "Graphics cards", short: "Graphics cards", glyph: "gpu" },
  { slug: "gaming-accessories", name: "Gaming accessories", short: "Accessories", glyph: "headset" },
];
const GAMING_SLUGS = new Set(GAMING_CATEGORIES.map((c) => c.slug));
export const isGamingCategory = (slug: string) => GAMING_SLUGS.has(slug);

export type BuildKey = "volt" | "havoc" | "riptide" | "warpath" | "juggernaut";
export type Resolution = "1080p" | "1440p" | "4K";
export const RESOLUTIONS: Resolution[] = ["1080p", "1440p", "4K"];

export interface BuildTier {
  key: BuildKey;
  /** The catalog product (Website › Products) that holds the build's name, price, specs and photos. */
  slug: string;
  name: string;
  /** What it is for, on the card badge. */
  target: string;
  resolution: Resolution;
  tagline: string;
  /** 0-100 against the top build, for the part bars on the card. */
  bars: { cpu: number; gpu: number; ram: number; storage: number; cooling: number; power: number };
}

export const BUILDS: BuildTier[] = [
  { key: "volt", slug: "zeronix-volt-gaming-pc", name: "Volt", target: "1080p esports", resolution: "1080p", tagline: "High frame rates in CS2, Valorant and Fortnite.", bars: { cpu: 58, gpu: 34, ram: 25, storage: 25, cooling: 40, power: 54 } },
  { key: "havoc", slug: "zeronix-havoc-gaming-pc", name: "Havoc", target: "1080p high", resolution: "1080p", tagline: "Every big release at 1080p High, with room to stream.", bars: { cpu: 66, gpu: 44, ram: 50, storage: 25, cooling: 52, power: 62 } },
  { key: "riptide", slug: "zeronix-riptide-gaming-pc", name: "Riptide", target: "1440p", resolution: "1440p", tagline: "The sweet spot: 1440p High in open worlds and shooters.", bars: { cpu: 78, gpu: 58, ram: 50, storage: 50, cooling: 72, power: 62 } },
  { key: "warpath", slug: "zeronix-warpath-gaming-pc", name: "Warpath", target: "1440p ultra · 4K", resolution: "1440p", tagline: "Fastest gaming CPU for high-refresh 1440p and entry 4K.", bars: { cpu: 96, gpu: 76, ram: 50, storage: 50, cooling: 90, power: 71 } },
  { key: "juggernaut", slug: "zeronix-juggernaut-gaming-pc", name: "Juggernaut", target: "4K max", resolution: "4K", tagline: "No compromises: 4K max settings and heavy creator work.", bars: { cpu: 100, gpu: 100, ram: 100, storage: 100, cooling: 100, power: 100 } },
];
export const buildBySlug = (slug: string) => BUILDS.find((b) => b.slug === slug) ?? null;
export const buildByKey = (key: BuildKey) => BUILDS.find((b) => b.key === key)!;

/** [1080p, 1440p, 4K] estimated average FPS. */
type Fps = [number, number, number];

export interface Game {
  slug: string;
  title: string;
  genre: string;
  /** Shown on the card: "On PC" or the PC release status. */
  pcStatus: string;
  /** No PC version or official requirements yet: numbers are predictions. */
  predicted?: boolean;
  /** Why it is on the list in the UAE (players, scene). */
  note: string;
  /** The card's accent colour (flat, no gradient). */
  accent: string;
  /** 1-5 how hard the game pushes each part. */
  demand: { cpu: number; gpu: number };
  ramGb: number;
  vramGb: number;
  storageGb: number;
  /** The build we suggest first, and the cheapest that plays it well. */
  recommended: BuildKey;
  minimum: BuildKey;
  settings: string;
  fps: Record<BuildKey, Fps>;
  /** A page of its own (GTA VI has a bigger page at this address). */
  path?: string;
}

export const GAMES: Game[] = [
  {
    slug: "gta-6",
    title: "Grand Theft Auto VI",
    genre: "Open world",
    pcStatus: "PC expected 2027",
    predicted: true,
    note: "Out on PS5 and Xbox since 19 November 2026. The PC version is expected in 2027; Rockstar has not confirmed a date or requirements yet.",
    accent: "#e5407a",
    demand: { cpu: 5, gpu: 5 },
    ramGb: 32,
    vramGb: 12,
    storageGb: 150,
    recommended: "riptide",
    minimum: "havoc",
    settings: "Predicted, High preset",
    fps: { volt: [48, 36, 19], havoc: [62, 47, 25], riptide: [80, 61, 34], warpath: [100, 79, 46], juggernaut: [134, 108, 70] },
    path: "/gaming/gta-6-pc",
  },
  {
    slug: "gta-5",
    title: "GTA V & GTA Online",
    genre: "Open world",
    pcStatus: "On PC",
    note: "Still one of the most played games in the UAE, with busy local roleplay servers.",
    accent: "#3fae5a",
    demand: { cpu: 3, gpu: 3 },
    ramGb: 16,
    vramGb: 8,
    storageGb: 110,
    recommended: "havoc",
    minimum: "volt",
    settings: "Enhanced edition, High",
    fps: { volt: [112, 86, 50], havoc: [136, 108, 64], riptide: [162, 132, 82], warpath: [192, 162, 106], juggernaut: [232, 204, 150] },
  },
  {
    slug: "call-of-duty-warzone",
    title: "Call of Duty: Warzone",
    genre: "Battle royale",
    pcStatus: "On PC",
    note: "The biggest shooter in the region's lobbies, free to play.",
    accent: "#8a9a5b",
    demand: { cpu: 4, gpu: 4 },
    ramGb: 16,
    vramGb: 8,
    storageGb: 150,
    recommended: "riptide",
    minimum: "volt",
    settings: "High",
    fps: { volt: [108, 80, 44], havoc: [134, 100, 57], riptide: [166, 126, 75], warpath: [206, 160, 100], juggernaut: [262, 214, 148] },
  },
  {
    slug: "ea-sports-fc",
    title: "EA Sports FC",
    genre: "Football",
    pcStatus: "On PC",
    note: "The UAE's favourite sports game, from couch matches to Ultimate Team.",
    accent: "#1f8bd6",
    demand: { cpu: 2, gpu: 2 },
    ramGb: 16,
    vramGb: 6,
    storageGb: 100,
    recommended: "volt",
    minimum: "volt",
    settings: "Ultra",
    fps: { volt: [180, 150, 90], havoc: [210, 180, 112], riptide: [240, 212, 140], warpath: [240, 236, 170], juggernaut: [240, 240, 210] },
  },
  {
    slug: "counter-strike-2",
    title: "Counter-Strike 2",
    genre: "Tactical shooter",
    pcStatus: "On PC",
    note: "Steam's most played game, and the main event at every UAE esports night.",
    accent: "#e8a23a",
    demand: { cpu: 4, gpu: 2 },
    ramGb: 16,
    vramGb: 4,
    storageGb: 85,
    recommended: "havoc",
    minimum: "volt",
    settings: "High",
    fps: { volt: [300, 222, 122], havoc: [360, 280, 160], riptide: [420, 340, 212], warpath: [550, 452, 290], juggernaut: [650, 560, 400] },
  },
  {
    slug: "valorant",
    title: "Valorant",
    genre: "Tactical shooter",
    pcStatus: "On PC",
    note: "Huge in the Gulf, with Riot servers in Bahrain for low ping.",
    accent: "#ff4655",
    demand: { cpu: 3, gpu: 1 },
    ramGb: 16,
    vramGb: 4,
    storageGb: 50,
    recommended: "volt",
    minimum: "volt",
    settings: "High",
    fps: { volt: [400, 320, 180], havoc: [450, 380, 230], riptide: [520, 450, 290], warpath: [650, 560, 380], juggernaut: [750, 680, 520] },
  },
  {
    slug: "fortnite",
    title: "Fortnite",
    genre: "Battle royale",
    pcStatus: "On PC",
    note: "The game most young players in the UAE start on.",
    accent: "#9d4dbb",
    demand: { cpu: 3, gpu: 3 },
    ramGb: 16,
    vramGb: 6,
    storageGb: 100,
    recommended: "havoc",
    minimum: "volt",
    settings: "High, DirectX 12",
    fps: { volt: [120, 85, 45], havoc: [150, 110, 60], riptide: [185, 140, 80], warpath: [230, 180, 110], juggernaut: [300, 250, 170] },
  },
  {
    slug: "battlefield-6",
    title: "Battlefield 6",
    genre: "Shooter",
    pcStatus: "On PC",
    note: "Big 64-player maps that reward a strong graphics card.",
    accent: "#e66b2e",
    demand: { cpu: 4, gpu: 4 },
    ramGb: 16,
    vramGb: 8,
    storageGb: 90,
    recommended: "riptide",
    minimum: "havoc",
    settings: "High",
    fps: { volt: [98, 72, 40], havoc: [124, 92, 52], riptide: [150, 115, 68], warpath: [190, 148, 90], juggernaut: [240, 200, 140] },
  },
  {
    slug: "pubg-battlegrounds",
    title: "PUBG: Battlegrounds",
    genre: "Battle royale",
    pcStatus: "On PC",
    note: "Free to play on PC, with a big Arabic-speaking player base.",
    accent: "#d9a520",
    demand: { cpu: 3, gpu: 3 },
    ramGb: 16,
    vramGb: 6,
    storageGb: 50,
    recommended: "havoc",
    minimum: "volt",
    settings: "Ultra",
    fps: { volt: [140, 105, 58], havoc: [170, 130, 75], riptide: [210, 165, 98], warpath: [260, 210, 130], juggernaut: [320, 270, 190] },
  },
  {
    slug: "apex-legends",
    title: "Apex Legends",
    genre: "Battle royale",
    pcStatus: "On PC",
    note: "Fast hero shooter where a 165 Hz screen pays off.",
    accent: "#cd3333",
    demand: { cpu: 3, gpu: 3 },
    ramGb: 16,
    vramGb: 6,
    storageGb: 75,
    recommended: "havoc",
    minimum: "volt",
    settings: "High",
    fps: { volt: [160, 115, 62], havoc: [190, 145, 80], riptide: [240, 185, 105], warpath: [280, 230, 140], juggernaut: [300, 290, 200] },
  },
  {
    slug: "marvel-rivals",
    title: "Marvel Rivals",
    genre: "Hero shooter",
    pcStatus: "On PC",
    note: "One of Steam's top games, and heavy on the graphics card.",
    accent: "#c8102e",
    demand: { cpu: 3, gpu: 5 },
    ramGb: 16,
    vramGb: 8,
    storageGb: 70,
    recommended: "riptide",
    minimum: "havoc",
    settings: "High",
    fps: { volt: [80, 58, 32], havoc: [100, 75, 42], riptide: [125, 95, 55], warpath: [160, 122, 72], juggernaut: [210, 170, 110] },
  },
  {
    slug: "dota-2",
    title: "Dota 2",
    genre: "MOBA",
    pcStatus: "On PC",
    note: "The Middle East's biggest MOBA, with servers in Dubai.",
    accent: "#b8312f",
    demand: { cpu: 3, gpu: 2 },
    ramGb: 16,
    vramGb: 4,
    storageGb: 60,
    recommended: "volt",
    minimum: "volt",
    settings: "Best looking",
    fps: { volt: [180, 150, 95], havoc: [210, 180, 120], riptide: [250, 220, 150], warpath: [300, 270, 195], juggernaut: [350, 320, 260] },
  },
  {
    slug: "cyberpunk-2077",
    title: "Cyberpunk 2077",
    genre: "Open world RPG",
    pcStatus: "On PC",
    note: "The game people use to test a new PC. Ray tracing needs the top builds.",
    accent: "#f2c230",
    demand: { cpu: 4, gpu: 5 },
    ramGb: 16,
    vramGb: 12,
    storageGb: 70,
    recommended: "warpath",
    minimum: "havoc",
    settings: "High, no ray tracing",
    fps: { volt: [75, 52, 26], havoc: [95, 68, 34], riptide: [120, 88, 45], warpath: [150, 112, 60], juggernaut: [200, 160, 95] },
  },
  {
    slug: "rocket-league",
    title: "Rocket League",
    genre: "Sports",
    pcStatus: "On PC",
    note: "Easy to run, hard to master, and a regular at UAE tournaments.",
    accent: "#2f7de1",
    demand: { cpu: 2, gpu: 2 },
    ramGb: 8,
    vramGb: 4,
    storageGb: 25,
    recommended: "volt",
    minimum: "volt",
    settings: "High quality",
    fps: { volt: [250, 200, 120], havoc: [300, 250, 150], riptide: [360, 300, 190], warpath: [420, 360, 240], juggernaut: [500, 450, 330] },
  },
];

export const gameBySlug = (slug: string) => GAMES.find((g) => g.slug === slug) ?? null;
export const gamePath = (g: Game) => g.path ?? `/gaming/games/${g.slug}`;
export const GTA6 = gameBySlug("gta-6")!;

/** How smooth a frame rate plays, for the bar colour and the word next to it. */
export function fpsBand(fps: number): { label: string; tone: "great" | "good" | "ok" | "low" } {
  if (fps >= 144) return { label: "Ultra smooth", tone: "great" };
  if (fps >= 60) return { label: "Smooth", tone: "good" };
  if (fps >= 30) return { label: "Playable", tone: "ok" };
  return { label: "Too low", tone: "low" };
}

export const DEMAND_WORDS = ["", "Light", "Moderate", "Medium", "High", "Very high"] as const;

/** The best resolution a build plays a game at 60+ FPS, for "plays X at 1440p" lines. */
export function bestResolution(g: Game, b: BuildKey): Resolution | null {
  const f = g.fps[b];
  for (let i = 2; i >= 0; i--) if (f[i] >= 60) return RESOLUTIONS[i];
  return null;
}
