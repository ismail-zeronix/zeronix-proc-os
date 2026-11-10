"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Photo } from "@/components/brand/photo";
import { cn } from "@/lib/utils";

interface GalleryImage {
  src: string;
  alt: string;
}

const arrow = "absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-brand-900 shadow-sm ring-1 ring-line/70 transition-colors hover:bg-cta";

/**
 * Product pictures: the main picture whole (never cropped) on white, arrows and swipe to move, thumbnails under it, and
 * a full-screen view on tap. Without pictures it is the usual photo slot.
 */
export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = images.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom, go]);

  if (!n) {
    return (
      <div className="rounded-frame bg-white p-3">
        <Photo subject={`${name}: product shot`} ratio="1:1" priority className="rounded-card" />
      </div>
    );
  }

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touchX.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      touchX.current = null;
    },
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
      <div className="relative rounded-frame border border-line/70 bg-white" {...swipe}>
        <button type="button" onClick={() => setZoom(true)} className="relative block aspect-square w-full cursor-zoom-in lg:aspect-[5/4]" aria-label="View larger">
          <Image src={images[i].src} alt={images[i].alt || name} fill priority={i === 0} sizes="(min-width: 1024px) 45vw, 100vw" className="object-contain p-4 sm:p-6" />
        </button>
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className={cn(arrow, "left-2")} aria-label="Previous picture">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(1)} className={cn(arrow, "right-2")} aria-label="Next picture">
              <ChevronRight className="size-5" />
            </button>
            <span className="absolute right-3 bottom-3 rounded-full bg-brand-950/70 px-2 py-0.5 text-[0.6875rem] font-semibold text-white tabular-nums">
              {i + 1} / {n}
            </span>
          </>
        )}
      </div>
      {n > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {images.map((img, k) => (
            <li key={img.src} className="shrink-0">
              <button
                type="button"
                onClick={() => setI(k)}
                aria-label={`Picture ${k + 1}`}
                aria-current={k === i}
                className={cn("relative block size-16 overflow-hidden rounded-inner border-2 bg-white sm:size-18", k === i ? "border-brand-900" : "border-line/70 hover:border-brand-700")}
              >
                <Image src={img.src} alt="" fill sizes="72px" className="object-contain p-1" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label={`${name} pictures`} className="fixed inset-0 z-60 grid bg-brand-950/95" onClick={() => setZoom(false)} {...swipe}>
          <div className="relative m-3 sm:m-10" onClick={(e) => e.stopPropagation()}>
            <Image src={images[i].src} alt={images[i].alt || name} fill sizes="100vw" className="rounded-card bg-white object-contain p-4" />
          </div>
          <button type="button" onClick={() => setZoom(false)} className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white text-brand-950 hover:bg-cta" aria-label="Close">
            <X className="size-5" />
          </button>
          {n > 1 && (
            <>
              <button type="button" onClick={(e) => (e.stopPropagation(), go(-1))} className={cn(arrow, "left-4 size-11")} aria-label="Previous picture">
                <ChevronLeft className="size-6" />
              </button>
              <button type="button" onClick={(e) => (e.stopPropagation(), go(1))} className={cn(arrow, "right-4 size-11")} aria-label="Next picture">
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
