import Image from "next/image";
import { LogoMark } from "./logo";
import { cn } from "@/lib/utils";

const RATIO = { "16:9": "aspect-video", "4:5": "aspect-[4/5]", "4:3": "aspect-[4/3]", "3:2": "aspect-[3/2]", "1:1": "aspect-square", "21:9": "aspect-[21/9]" } as const;
export type PhotoRatio = keyof typeof RATIO;

/**
 * A rounded photo. Until a real picture is uploaded it shows a quiet brand tile (logo mark and the subject), which looks
 * finished to visitors while still telling the owner what belongs there. `fill` lets the parent decide the size instead.
 */
export function Photo({
  src,
  subject,
  ratio = "4:3",
  fill = false,
  priority = false,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  tone = "light",
  slotAt = "center",
  className,
}: {
  src?: string;
  subject: string;
  ratio?: PhotoRatio;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  tone?: "light" | "dark";
  /** Where the slot label sits; "end" keeps it clear of text laid over the photo. */
  slotAt?: "center" | "end";
  className?: string;
}) {
  const box = cn("relative overflow-hidden rounded-inner", !fill && RATIO[ratio], fill && "h-full w-full", className);
  if (src) {
    return (
      <div className={box}>
        <Image src={src} alt={subject} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  // No picture yet: a finished-looking brand tile (logo mark and the subject, quietly), never a striped "photo slot".
  return (
    <div
      role="img"
      aria-label={subject}
      className={cn(
        box,
        "grid p-5 text-center",
        slotAt === "end" ? "place-items-end" : "place-items-center",
        tone === "dark" ? "bg-brand-800 text-white/55" : "bg-canvas text-ink/40 ring-1 ring-line/60 ring-inset",
      )}
    >
      <span className="grid max-w-[16rem] justify-items-center gap-2.5">
        <LogoMark className={cn("size-9", tone === "dark" && "[&_rect]:fill-brand-950")} />
        <span className="line-clamp-2 text-xs leading-snug font-medium">{subject}</span>
      </span>
    </div>
  );
}
