"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * The search box of a list: filters as you type (after a short pause), kept in the URL as `q` so a link or the back
 * button gives the same rows. Typing starts again from page 1; sort and view stay.
 */
export function ListSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [seen, setSeen] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the back button or a link can change the URL under the box
  if (seen !== urlQ) {
    setSeen(urlQ);
    setQ(urlQ);
  }
  const go = (v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v.trim()) next.set("q", v.trim());
    else next.delete("q");
    next.delete("page");
    const s = next.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  };
  const change = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(v), 350);
  };
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={q}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (timer.current) clearTimeout(timer.current);
            go(q);
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {q && (
        <button type="button" aria-label="Clear the search" className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => change("")}>
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
