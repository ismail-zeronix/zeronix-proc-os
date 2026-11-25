"use client";

import Link from "next/link";
import { useState } from "react";
import { fpsBand, GAMES, gamePath, RESOLUTIONS, type BuildTier, type Resolution } from "@/lib/gaming";
import { cn } from "@/lib/utils";
import { ResolutionTabs } from "./game-finder";
import { Bar, G } from "./parts";

/**
 * On a Zeronix Custom PC's product page: estimated FPS in every game we list at the chosen resolution, plus the part
 * bars against our top build. In the Gaming look (white, HUD frame, segmented meters); the rest of the product page is the normal store.
 */
export function BuildPerformance({ tier }: { tier: BuildTier }) {
  const [res, setRes] = useState<Resolution>(tier.resolution);
  const i = RESOLUTIONS.indexOf(res);
  const top = Math.max(...GAMES.map((g) => g.fps[tier.key][0]));
  const parts: [string, number][] = [
    ["Processor", tier.bars.cpu],
    ["Graphics", tier.bars.gpu],
    ["Memory", tier.bars.ram],
    ["Storage", tier.bars.storage],
    ["Cooling", tier.bars.cooling],
    ["Power", tier.bars.power],
  ];
  return (
    <section className={cn("frame mb-4 border border-line", G.page)} aria-labelledby="perf">
      <div className="container-site grid gap-5 py-6 sm:py-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)] lg:gap-10">
        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className={cn("mb-1 flex items-center gap-2", G.label, G.accentText)}><span aria-hidden className="gx-cut-sm h-2.5 w-4 bg-cta" />Game performance</p>
              <h2 id="perf" className={cn("text-h2 font-extrabold tracking-tight", G.ink)}>
                What the {tier.name} plays
              </h2>
            </div>
            <ResolutionTabs value={res} onChange={setRes} />
          </div>
          <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {GAMES.map((g) => {
              const fps = g.fps[tier.key][i];
              const band = fpsBand(fps);
              return (
                <li key={g.slug}>
                  <Link href={gamePath(g)} className="grid gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-soft">
                    <span className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                      <span className={cn("truncate font-semibold", G.ink)}>
                        {g.title}
                        {g.predicted && <span className="ml-1.5 text-[0.6875rem] text-amber-700">predicted</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span className={cn("font-mono font-extrabold", G.ink)}>{fps}</span> <span className={cn("font-mono text-[0.625rem] font-bold", G.muted)}>FPS</span>
                      </span>
                    </span>
                    <Bar value={(fps / top) * 100} tone={band.tone} />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className={cn("mt-4 text-[0.6875rem]", G.muted)}>Estimated average FPS at High settings from public benchmarks of the same processor and graphics card. Real results depend on settings, drivers and game updates.</p>
        </div>
        <div data-on="true" className={cn("gx-frame grid content-start gap-3 self-start p-4 sm:p-5", G.panel)}>
          <p className={cn(G.label, G.muted)}>Against our top build</p>
          {parts.map(([label, v]) => (
            <div key={label} className="grid gap-1">
              <span className="flex justify-between text-xs">
                <span className={cn("font-semibold", G.ink)}>{label}</span>
                <span className={cn("font-mono font-bold tabular-nums", G.muted)}>{v}%</span>
              </span>
              <Bar value={v} className="h-2" />
            </div>
          ))}
          <Link href="/gaming#builds" className={cn("pt-1 text-xs font-bold tracking-wide uppercase hover:underline", G.accentText)}>
            Compare all Zeronix builds →
          </Link>
        </div>
      </div>
    </section>
  );
}
