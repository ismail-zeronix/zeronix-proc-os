import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const RATIO = { "16:9": "aspect-video", "4:5": "aspect-[4/5]", "4:3": "aspect-[4/3]", "3:2": "aspect-[3/2]", "1:1": "aspect-square", "21:9": "aspect-[21/9]" } as const;
export type PhotoRatio = keyof typeof RATIO;

/**
 * A rounded photo. Until a real picture is uploaded it is a photo slot (BRAND.md section 7): a sage panel naming the
 * subject and ratio, so the owner knows exactly what to shoot. `fill` lets the parent decide the size instead.
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
  return (
    <div
      role="img"
      aria-label={`Photo: ${subject}`}
      className={cn(
        box,
        "grid p-6 text-center",
        slotAt === "end" ? "place-items-end" : "place-items-center",
        tone === "dark" ? "bg-forest-800 text-white/60" : "bg-sage-100 text-forest-700/70",
        "bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgb(255_255_255/0.35)_14px_15px)]",
      )}
    >
      <span className="grid max-w-[16rem] justify-items-center gap-2">
        <ImageIcon className="size-6" strokeWidth={1.5} />
        <span className="text-xs leading-snug font-medium">{subject}</span>
        <span className="text-[0.6875rem] tracking-[0.12em] uppercase opacity-70">Photo · {ratio}</span>
      </span>
    </div>
  );
}
