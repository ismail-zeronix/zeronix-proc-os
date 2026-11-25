import { Breadcrumbs, CtaStrip, Faq, JsonLd, quoteLink } from "@/components/catalog/page-parts";
import { SITE_URL } from "@/lib/defaults";
import { bestResolution, buildByKey, GAMES, gamePath, type Game } from "@/lib/gaming";
import { finderBuilds, type LoadedBuild } from "@/lib/gaming-data";
import { cn } from "@/lib/utils";
import { GamePanel } from "./game-finder";
import { BuildCard, G, GameTile, GHeading } from "./parts";

export type SpecRow = { tier: string; cpu: string; gpu: string; ram: string; storage: string };

/** The questions every "<game> PC requirements" search asks, answered from the game's own data. */
export function gameFaq(game: Game, builds: LoadedBuild[]) {
  const rec = buildByKey(game.recommended);
  const min = buildByKey(game.minimum);
  const short = game.title.split(":")[0];
  const recFps = game.fps[rec.key];
  return [
    { q: `What PC do I need for ${short}?`, a: `For a smooth ${rec.resolution} experience we recommend the Zeronix ${rec.name} (about ${recFps[rec.resolution === "4K" ? 2 : rec.resolution === "1440p" ? 1 : 0]} FPS${game.predicted ? ", predicted" : ""}). The lowest build we suggest is the ${min.name}, which gives about ${game.fps[min.key][0]} FPS at 1080p.` },
    { q: `How much RAM does ${short} need?`, a: `${game.ramGb}GB${game.predicted ? " is our prediction" : " is what we recommend"}. Every Zeronix build from the Havoc up has 32GB of DDR5.` },
    { q: `How much storage does ${short} take?`, a: `Plan for about ${game.storageGb}GB on an NVMe SSD. Every Zeronix build has at least a 1TB NVMe SSD.` },
    {
      q: `Can the cheapest Zeronix PC run ${short}?`,
      a: (() => {
        const v = builds[0]?.tier ?? buildByKey("volt");
        const res = bestResolution(game, v.key);
        return res ? `Yes. The ${v.name} plays it at ${res} above 60 FPS (estimated).` : `It runs, but below 60 FPS at 1080p High. We suggest the ${min.name} or above.`;
      })(),
    },
  ];
}

/**
 * One game's page (/gaming/games/<slug>, GTA VI at /gaming/gta-6-pc): what it asks of each part, FPS of every build,
 * the recommended builds and the questions people search for. `extra` adds content between (GTA VI's spec table).
 */
export function GamePageView({ game, builds, ctaLabel, intro, specs, faq, extraTop, heading }: { game: Game; builds: LoadedBuild[]; ctaLabel: string; intro: string; specs?: SpecRow[]; faq: { q: string; a: string }[]; extraTop?: React.ReactNode; heading?: string }) {
  const path = gamePath(game);
  const picks = builds.filter((b) => [game.minimum, game.recommended].includes(b.tier.key) || b.tier.key === "juggernaut");
  const others = GAMES.filter((g) => g.slug !== game.slug).slice(0, 8);
  return (
    <>
      <div className={G.page}>
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="gx-grid absolute inset-0 -z-10" />
          <div className="container-site grid gap-3 pt-3 pb-6 sm:gap-4 sm:pt-6 sm:pb-8">
          <Breadcrumbs
            items={[
              { href: "/gaming", label: "Gaming" },
              { href: path, label: `${game.title} PC` },
            ]}
          />
          <div className="relative grid gap-2 pl-3.5">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 rounded-full" style={{ background: game.accent }} />
            <p className={G.label} style={{ color: game.accent }}>
              {game.genre} · {game.pcStatus}
              {game.predicted && " · requirements predicted"}
            </p>
            <h1 className={cn("text-2xl leading-[1.08] font-black tracking-tight uppercase sm:text-4xl xl:text-[2.5rem]", G.ink)}>{heading ?? (game.predicted ? `${game.title} Ready PC` : `${game.title} PC: requirements and FPS`)}</h1>
            <p className={cn("max-w-3xl text-lead", G.muted)}>{intro}</p>
          </div>
          </div>
        </section>

        {extraTop}

        <section className="container-site pb-6 sm:pb-10">
          <GamePanel game={game} builds={finderBuilds(builds)} showLink={false} />
        </section>

        {specs && (
          <section className="container-site pb-6 sm:pb-10">
            <GHeading kicker={game.predicted ? "Predicted" : "Requirements"} title={`${game.title.split(":")[0]} PC requirements`} lead={game.predicted ? "Our prediction until Rockstar publishes the official list. Windows 11 64-bit and an NVMe SSD are a safe bet." : undefined} />
            <div data-on="true" className={cn("gx-frame overflow-x-auto", G.panel)}>
              <table className="w-full min-w-[36rem] text-left text-[0.8125rem]">
                <thead className="bg-[#0b0e14] font-mono text-[0.6875rem] tracking-wider text-white/70 uppercase">
                  <tr>
                    {["", "Processor", "Graphics", "Memory", "Storage"].map((h) => (
                      <th key={h} className="px-4 py-3 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {specs.map((r) => (
                    <tr key={r.tier} className="border-t border-line">
                      <th className="px-4 py-3 font-extrabold text-ink">{r.tier}</th>
                      <td className="px-4 py-3 text-ink/75">{r.cpu}</td>
                      <td className="px-4 py-3 text-ink/75">{r.gpu}</td>
                      <td className="px-4 py-3 text-ink/75">{r.ram}</td>
                      <td className="px-4 py-3 text-ink/75">{r.storage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {picks.length > 0 && (
          <section className="container-site pb-6 sm:pb-10">
            <GHeading kicker="Zeronix Custom PCs" title={`Our builds for ${game.title.split(":")[0]}`} href="/gaming#builds" linkLabel="All builds" />
            <ul className="-mx-3 grid auto-cols-[78%] grid-flow-col gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:gap-3 sm:px-0 [&::-webkit-scrollbar]:hidden">
              {picks.map((b) => (
                <li key={b.tier.key}>
                  <BuildCard tier={b.tier} product={b.product} featured={b.tier.key === game.recommended} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="container-site pb-8 sm:pb-12">
          <GHeading title="More games" href="/gaming#games" linkLabel="All games" />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {others.map((g) => (
              <li key={g.slug}>
                <GameTile game={g} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="pt-2">
        <Faq items={faq} title={`${game.title.split(":")[0]} PC questions`} />
        <CtaStrip title="Not sure which build?" text={`Tell us your budget and screen, and we suggest the right PC for ${game.title.split(":")[0]}.`} quoteHref={quoteLink({ category: "gaming-pcs" })} label={ctaLabel} />
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${game.title} PC requirements and recommended builds`,
          url: `${SITE_URL}${path}`,
          about: { "@type": "VideoGame", name: game.title, genre: game.genre },
        }}
      />
    </>
  );
}
