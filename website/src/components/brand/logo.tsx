import Link from "next/link";
import { cn } from "@/lib/utils";

/** The mark: a navy tile with a geometric mint "Z" (BRAND.md section 8). Also the favicon. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-brand-900" />
      <path d="M9 9h14v3.5L13.8 20H23v3.5H9V20l9.2-7.5H9z" className="fill-cta" />
    </svg>
  );
}

/** Mark + wordmark "zeronix tech". `onDark` swaps to white and mint. */
export function Logo({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label="Zeronix Tech home" className={cn("flex items-center gap-2.5 font-heading text-[1.35rem] leading-none tracking-tight", className)}>
      <LogoMark className={onDark ? "[&_rect]:fill-brand-800" : undefined} />
      <span>
        <span className={cn("font-bold", onDark ? "text-white" : "text-brand-950")}>zeronix</span>
        <span className={cn("font-medium", onDark ? "text-highlight" : "text-brand-700")}> tech</span>
      </span>
    </Link>
  );
}
