import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The geometric "Z": top bar, diagonal, bottom bar as one stroke with softly rounded ends, on a 40 x 40 grid. The
 * same path is in icon.svg, the app icons and the share image.
 */
export const Z_PATH = "M12.5 12.5h15L12.5 27.5h15";

/**
 * The mark: a green rounded tile with a clean geometric white "Z". Also the favicon and app icon. `inverse` gives the
 * white tile with a green "Z", for use on the green phone header.
 */
export function LogoMark({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-9 shrink-0", className)}>
      <rect width="40" height="40" rx="10" className={inverse ? "fill-white" : "fill-cta"} />
      <path d={Z_PATH} fill="none" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" className={inverse ? "stroke-cta" : "stroke-white"} />
    </svg>
  );
}

/**
 * Logo lock-up, classic and stacked: the mark, then "Zeronix" in a bold title-case wordmark over a small, widely
 * spaced "TECHNOLOGY" that runs the width of the name. `onDark` is the white version (green phone header, coloured
 * bands); the default is for white. `tagline` adds a line after a divider (desktop header).
 */
export function Logo({ onDark = false, tagline, size = "md", className }: { onDark?: boolean; tagline?: string; size?: "sm" | "md"; className?: string }) {
  const sm = size === "sm";
  return (
    <Link href="/" aria-label="Zeronix Tech home" className={cn("group inline-flex items-center leading-none", sm ? "gap-2" : "gap-2.5", className)}>
      <LogoMark inverse={onDark} className={sm ? "size-7" : "size-8 sm:size-9"} />
      <span className="grid font-sans">
        <span className={cn("leading-none font-bold tracking-[-0.025em]", sm ? "text-[1.0625rem]" : "text-[1.25rem] sm:text-[1.4rem]", onDark ? "text-white" : "text-brand-900")}>Zeronix</span>
        <span className={cn("mt-[3px] leading-none font-semibold uppercase", sm ? "text-[0.375rem] tracking-[0.33em]" : "text-[0.4375rem] tracking-[0.34em] sm:text-[0.5rem] sm:tracking-[0.36em]", onDark ? "text-white/80" : "text-muted-ink")}>Technology</span>
      </span>
      {tagline && <span className="ml-1.5 hidden border-l border-line pl-3 text-xs leading-tight font-medium whitespace-nowrap text-muted-ink xl:block">{tagline}</span>}
    </Link>
  );
}
