"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buildByKey, fpsBand, GAMES, gameBySlug, gamePath, RESOLUTIONS, type BuildKey, type Game, type Resolution } from "@/lib/gaming";
import { cn } from "@/lib/utils";
import { Bar, DemandRow, G, GameTile } from "./parts";

export interface FinderBuild {
  key: BuildKey;
  name: string;
  href: string;
  price: string | null;
}

/** 1080p / 1440p / 4K switch. */
export function ResolutionTabs({ value, onChange }: { value: Resolution; onChange: (r: Resolution) => void }) {
  return (
    <div role="tablist" aria-label="Resolution" className="gx-cut inline-flex bg-[#eef0f2] p-0.5">
      {RESOLUTIONS.map((r) => (
        <button key={r} type="button" role="tab" aria-selected={value === r} onClick={() => onChange(r)} className={cn("gx-cut-sm h-8 px-3 font-mono text-xs font-bold tracking-wide transition-colors duration-200 sm:px-4", value === r ? "bg-[#0b0e14] text-[#2fcf7a]" : "text-ink/70 hover:bg-panel hover:text-ink")}>
          {r}
        </button>
      ))}
    </div>
  );
}

/** One game: what it asks of each part, and the estimated FPS of every Zeronix build at the chosen resolution. */
export function GamePanel({ game, builds, showLink = true }: { game: Game; builds: FinderBuild[]; showLink?: boolean }) {
  const [res, setRes] = useState<Resolution>(buildByKey(game.recommended).resolution);
  const i = RESOLUTIONS.indexOf(res);
  // bars are measured against the best 1080p figure, so switching to 4K visibly shortens them
  const top = Math.max(1, ...builds.map((b) => game.fps[b.key][0]));
  const rec = builds.find((b) => b.key === game.recommended);
  const recTier = buildByKey(game.recommended);
  return (
    <div className={cn("gx-frame grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-8", G.panel)} data-on="true">
      <div className="grid content-start gap-3.5">
        <div>
          <p className="text-[0.6875rem] font-bold tracking-[0.14em] uppercase" style={{ color: game.accent }}>
            {game.genre}
          </p>
          <h3 className={cn("text-xl font-extrabold tracking-tight sm:text-2xl", G.ink)}>{game.title}</h3>
          <p className={cn("mt-1 text-xs sm:text-[0.8125rem]", G.muted)}>{game.note}</p>
        </div>
        <p className={cn(G.label, G.muted)}>What it takes{game.predicted && " (predicted)"}</p>
        <DemandRow label="Processor" level={game.demand.cpu} detail={game.demand.cpu >= 4 ? "8 cores recommended" : "6 cores is plenty"} />
        <DemandRow label="Graphics" level={game.demand.gpu} detail={`${game.vramGb}GB+ graphics memory`} />
        <DemandRow label="Memory" level={game.ramGb >= 32 ? 5 : game.ramGb >= 16 ? 3 : 2} detail={`${game.ramGb}GB RAM`} />
        <DemandRow label="Storage" level={game.storageGb >= 150 ? 5 : game.storageGb >= 100 ? 4 : game.storageGb >= 60 ? 3 : 2} detail={`${game.storageGb}GB on NVMe SSD`} />
        <dl className="grid grid-cols-3 gap-2 pt-1 text-center">
          {[
            ["Cooler", game.demand.cpu >= 4 ? "240 mm AIO" : "Tower air"],
            ["Board", game.demand.cpu >= 5 ? "B850 / X870" : "B650"],
            ["Power", game.demand.gpu >= 5 ? "750W+ Gold" : "650W Gold"],
          ].map(([k, v]) => (
            <div key={k} className="gx-cut-sm border-b-2 border-cta bg-surface-soft px-2 py-2">
              <dt className="font-mono text-[0.625rem] font-bold tracking-wider text-muted-ink uppercase">{k}</dt>
              <dd className="text-xs font-bold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn(G.label, G.muted)}>Estimated FPS · {game.settings}</p>
          <ResolutionTabs value={res} onChange={setRes} />
        </div>
        <ul className="grid gap-2.5">
          {builds.map((b) => {
            const fps = game.fps[b.key][i];
            const band = fpsBand(fps);
            const recd = b.key === game.recommended;
            return (
              <li key={b.key}>
                <Link href={b.href} className={cn("group grid gap-1.5 rounded-md border-l-2 px-2.5 py-2 transition-colors duration-200 hover:bg-surface-soft", recd ? "border-cta bg-surface" : "border-transparent")}>
                  <span className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                    <span className={cn("font-bold tracking-wide uppercase", G.ink)}>
                      {b.name} {recd && <span className={cn("ml-1.5 px-1.5 py-0.5 align-middle text-[0.5625rem]", G.label, G.dark)}>Recommended</span>}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className={cn("font-mono text-lg font-extrabold", G.ink)}>{fps}</span> <span className={cn("font-mono text-[0.625rem] font-bold uppercase", G.muted)}>FPS · {band.label}</span>
                    </span>
                  </span>
                  <Bar value={(fps / top) * 100} tone={band.tone} segments={20} className="h-2" />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className={cn("text-[0.6875rem]", G.muted)}>{game.predicted ? "Predicted from the console version and today's biggest open-world games. We update this when official PC requirements are out." : "Estimates from public benchmarks of the same processor and graphics card. Real FPS depends on settings, drivers and game updates."}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {rec && (
            <Link href={rec.href} className="gx-cut group/b inline-flex h-11 items-center gap-2 bg-[#0b0e14] px-5 text-sm font-bold text-white transition-colors hover:bg-cta">
              Get the {recTier.name} {rec.price && <span className="font-medium text-white/75">· {rec.price}</span>} <ArrowRight className="size-4 transition-transform group-hover/b:translate-x-1" />
            </Link>
          )}
          {showLink && (
            <Link href={gamePath(game)} className="gx-cut inline-flex h-11 items-center gap-2 bg-surface-soft px-5 text-sm font-bold text-ink transition-colors hover:bg-[#e3e6e9]">
              {game.title.split(":")[0]} PC guide
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Find a PC for your game": pick a game, see what it needs and how each build runs it. */
export function GameFinder({ builds, initial = "gta-6" }: { builds: FinderBuild[]; initial?: string }) {
  const [slug, setSlug] = useState(initial);
  const game = gameBySlug(slug) ?? GAMES[0];
  return (
    <div className="grid gap-3 sm:gap-4">
      <ul className="-mx-3 grid auto-cols-[minmax(11rem,46%)] grid-flow-col grid-rows-2 gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:grid-rows-none sm:px-0 lg:grid-cols-5 xl:grid-cols-7 [&::-webkit-scrollbar]:hidden">
        {GAMES.map((g) => (
          <li key={g.slug}>
            <GameTile game={g} active={g.slug === game.slug} onClick={() => setSlug(g.slug)} />
          </li>
        ))}
      </ul>
      <GamePanel key={game.slug} game={game} builds={builds} />
    </div>
  );
}
