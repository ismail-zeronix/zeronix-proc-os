"use client";

import { lookOf } from "./knowledge-tree";

/** A category's icon in its colour (the app guides use their app's icon). */
export function SectionIcon({ section, size = "md" }: { section: string; size?: "sm" | "md" }) {
  const { icon: Icon, color } = lookOf(section);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md ${size === "sm" ? "size-6" : "size-7"}`}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
    </span>
  );
}
