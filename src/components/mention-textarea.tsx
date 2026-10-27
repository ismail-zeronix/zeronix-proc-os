"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Handshake, Package, Receipt, Truck } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { mentionToken, parseMentions, recordToken, tokensToText } from "@/lib/chat/text";

export interface MentionPerson {
  id: number;
  name: string;
  hint?: string;
  /** Shown in the picker, e.g. "cannot see this deal". */
  warn?: string;
}

interface Pick {
  /** What the box shows: "@Bina Sales" or "#ZQ-2026-0012". */
  display: string;
  token: string;
}

// what people picked, per box, so a half-written message keeps its mentions while you move around the portal
const picksByKey = new Map<string, Pick[]>();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The mentions picked in one text box. `toTokens` turns "@Bina Sales" back into `@[Bina Sales](user:12)` (and records
 * into `#[...](quote:4)`) when the text is saved; text the person typed by hand stays plain.
 */
export function useMentions(key: string) {
  const ref = useRef<Pick[]>(picksByKey.get(key) ?? []);
  useEffect(() => {
    ref.current = picksByKey.get(key) ?? [];
  }, [key]);
  return {
    add(p: Pick) {
      ref.current = [...ref.current.filter((x) => x.display !== p.display), p];
      picksByKey.set(key, ref.current);
    },
    toTokens(text: string): string {
      let out = text;
      for (const p of [...ref.current].sort((a, b) => b.display.length - a.display.length)) {
        out = out.replace(new RegExp(`${escape(p.display)}(?![\\p{L}\\p{N}])`, "gu"), () => p.token);
      }
      return out;
    },
    /** Text saved with tokens, as the box should show it; its mentions stay mentions when saved again. */
    load(saved: string): string {
      for (const m of saved.matchAll(/([@#])\[([^\]]+)\]\(([a-z]+:\d+)\)/g)) this.add({ display: `${m[1]}${m[2]}`, token: m[0] });
      return tokensToText(saved);
    },
    /** People mentioned in the text so far. */
    mentioned(text: string): number[] {
      return parseMentions(this.toTokens(text));
    },
    reset() {
      ref.current = [];
      picksByKey.delete(key);
    },
  };
}
export type Mentions = ReturnType<typeof useMentions>;

interface RecordHit {
  ref: string;
  label: string;
  sub: string;
  icon: typeof Handshake;
}

async function searchRecords(q: string): Promise<RecordHit[]> {
  const enc = encodeURIComponent(q);
  // each search answers only for people with that app; the others come back empty
  const [sales, products] = await Promise.all([
    fetch(`/api/sales/search?kind=all&q=${enc}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`/api/search?limit=4&q=${enc}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const hits: RecordHit[] = [];
  for (const d of sales?.deals ?? []) hits.push({ ref: `deal:${d.id}`, label: d.title, sub: d.companyName, icon: Handshake });
  for (const q of sales?.quotes ?? []) hits.push({ ref: `quote:${q.id}`, label: q.number, sub: q.companyName, icon: FileText });
  for (const o of sales?.orders ?? []) hits.push({ ref: `order:${o.id}`, label: o.number, sub: o.companyName, icon: Truck });
  for (const i of sales?.invoices ?? []) hits.push({ ref: `invoice:${i.id}`, label: i.number, sub: i.companyName, icon: Receipt });
  for (const c of sales?.companies ?? []) hits.push({ ref: `company:${c.id}`, label: c.name, sub: c.emirate || "Company", icon: Building2 });
  for (const p of products?.products ?? []) hits.push({ ref: `product:${p.id}`, label: p.label, sub: p.partNumber || p.category, icon: Package });
  return hits.slice(0, 8);
}

interface Trigger {
  sign: "@" | "#";
  query: string;
  start: number;
  end: number;
}

/** The @word or #word being typed just before the caret, if any. */
function triggerAt(value: string, caret: number, records: boolean): Trigger | null {
  const before = value.slice(0, caret);
  const m = /(?:^|\s)([@#])([\p{L}\p{N}._-]{0,24}(?: [\p{L}\p{N}._-]{0,24})?)$/u.exec(before);
  if (!m || (m[1] === "#" && !records)) return null;
  return { sign: m[1] as "@" | "#", query: m[2], start: caret - m[2].length - 1, end: caret };
}

/**
 * A text box where "@" picks a teammate and "#" (with `records`) a deal, quote, order, invoice, company or product.
 * Arrow keys and Enter or Tab choose, Esc closes the list. Use with `useMentions` to save the picks as tokens.
 */
export function MentionTextarea({
  value,
  onChange,
  mentions,
  people,
  records = false,
  placement = "above",
  onKeyDown,
  focusOn,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  mentions: Mentions;
  people: MentionPerson[];
  records?: boolean;
  /** Where the list opens: above the box (chat) or below it (forms near the top of a page). */
  placement?: "above" | "below";
  /** The box takes the focus whenever this value changes (e.g. another conversation opened). */
  focusOn?: unknown;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const caretAfter = useRef<number | null>(null);
  useEffect(() => {
    if (focusOn !== undefined) box.current?.focus();
  }, [focusOn]);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [debounced, setDebounced] = useState("");
  const recordQuery = trigger?.sign === "#" ? trigger.query.trim() : "";
  useEffect(() => {
    const t = setTimeout(() => setDebounced(recordQuery), 200);
    return () => clearTimeout(t);
  }, [recordQuery]);
  const found = useQuery({ queryKey: ["mention-records", debounced], queryFn: () => searchRecords(debounced), enabled: debounced.length >= 2, staleTime: 30_000 });

  const needle = trigger?.sign === "@" ? trigger.query.toLowerCase() : "";
  const options =
    trigger?.sign === "@"
      ? people
          .filter((p) => !needle || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(needle)) || p.name.toLowerCase().startsWith(needle))
          .slice(0, 6)
          .map((p) => ({ key: `u${p.id}`, label: p.name, sub: p.warn ?? p.hint ?? "", warn: !!p.warn, person: p, record: null as RecordHit | null }))
      : trigger?.sign === "#"
        ? (found.data ?? []).map((r) => ({ key: r.ref, label: r.label, sub: r.sub, warn: false, person: null as MentionPerson | null, record: r }))
        : [];
  const open = !!trigger && (options.length > 0 || trigger.sign === "#");

  const look = (el: HTMLTextAreaElement) => {
    const t = triggerAt(el.value, el.selectionStart ?? el.value.length, records);
    setTrigger(t);
    if (t?.query !== trigger?.query || t?.sign !== trigger?.sign) setActive(0);
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o || !trigger) return;
    const display = `${trigger.sign}${o.label}`;
    const token = o.person ? mentionToken(o.person.id, o.person.name) : recordToken(o.record!.ref, o.record!.label);
    mentions.add({ display, token });
    const next = value.slice(0, trigger.start) + display + " " + value.slice(trigger.end);
    onChange(next);
    setTrigger(null);
    caretAfter.current = trigger.start + display.length + 1;
  };

  // put the caret after the inserted name as soon as the new text is on screen, before the next key press lands
  useLayoutEffect(() => {
    const el = box.current;
    if (caretAfter.current == null || !el) return;
    el.focus();
    el.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
  }, [value]);

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        {...rest}
        ref={box}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          look(e.target);
        }}
        onSelect={(e) => look(e.currentTarget)}
        onBlur={() => setTimeout(() => setTrigger(null), 150)}
        onKeyDown={(e) => {
          if (open && options.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
              return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
              e.preventDefault();
              choose(active);
              return;
            }
          }
          if (open && e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setTrigger(null);
            return;
          }
          onKeyDown?.(e);
        }}
        aria-autocomplete="list"
      />
      {open && (
        <div
          role="listbox"
          className={`absolute left-0 z-50 w-full min-w-56 overflow-hidden rounded-lg border bg-popover py-1 text-popover-foreground shadow-lg ${placement === "above" ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          {trigger.sign === "#" && !options.length && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {trigger.query.trim().length < 2 ? "Type 2 letters to find a deal, quote, order, invoice, company or product" : found.isFetching ? "Searching…" : "Nothing found"}
            </p>
          )}
          {options.map((o, i) => {
            const Icon = o.record?.icon;
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(i);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${i === active ? "bg-muted" : ""}`}
              >
                {o.person ? <UserAvatar name={o.person.name} size={20} /> : Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.sub && <span className={`max-w-[45%] shrink-0 truncate text-xs ${o.warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{o.sub}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Teammates to mention. With a record ("deal:12"), people who may not see it are marked with `warn` (e.g. "cannot see
 * this deal"), and `blocked(text)` lists the ones mentioned so far, to warn before saving.
 */
export function useMentionPeople(record?: string, warn = "cannot see this record") {
  const q = useQuery({
    queryKey: ["mention-people", record ?? ""],
    queryFn: async () => {
      const res = await fetch(`/api/chat/users${record ? `?record=${encodeURIComponent(record)}` : ""}`);
      if (!res.ok) return { users: [], canSee: undefined };
      return (await res.json()) as { users: { id: number; name: string; jobTitle: string }[]; canSee?: number[] };
    },
    staleTime: 60_000,
  });
  const canSee = q.data?.canSee ? new Set(q.data.canSee) : null;
  const people: MentionPerson[] = (q.data?.users ?? []).map((u) => ({ id: u.id, name: u.name, hint: u.jobTitle, warn: canSee && !canSee.has(u.id) ? warn : undefined }));
  return { people, blocked: (ids: number[]) => people.filter((p) => p.warn && ids.includes(p.id)), refetch: q.refetch };
}
