"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Lays its content out at `width` px (an A4 page is 794 px) and scales it down to fit a narrower box, like a PDF
 * preview: on a phone the quotation keeps its paper layout instead of squeezing the logo over the title, and people
 * pinch to read. In a box at least `width` wide it does nothing.
 */
export function FitWidth({ width = 794, className, children }: { width?: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => setZoom(Math.min(1, box.clientWidth / width));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    return () => watch.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={className}>
      <div style={zoom < 1 ? { width, zoom } : undefined}>{children}</div>
    </div>
  );
}
