"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Handshake, ListChecks, Lock, MessageCircle, Package, Receipt, SquareArrowOutUpRight, Truck } from "lucide-react";
import Link from "next/link";
import { AvatarStack } from "@/components/user-avatar";
import type { CardTone, CardView } from "@/lib/chat/types";
import { useChatStore } from "./chat-store";

// cards asked for within a few milliseconds go to the server in one request
let queue: { ref: string; resolve: (c: CardView | null) => void; reject: (e: unknown) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function loadCard(ref: string): Promise<CardView | null> {
  return new Promise((resolve, reject) => {
    queue.push({ ref, resolve, reject });
    timer ??= setTimeout(async () => {
      const batch = queue;
      queue = [];
      timer = null;
      try {
        const res = await fetch(`/api/chat/cards?refs=${encodeURIComponent([...new Set(batch.map((b) => b.ref))].join(","))}`);
        if (!res.ok) throw new Error("Could not load the card.");
        const { cards } = (await res.json()) as { cards: CardView[] };
        for (const b of batch) b.resolve(cards.find((c) => c.ref === b.ref) ?? null);
      } catch (e) {
        for (const b of batch) b.reject(e);
      }
    }, 15);
  });
}

export const cardKey = (ref: string) => ["chat", "card", ref] as const;

const ICON: Record<string, typeof Handshake> = {
  deal: Handshake,
  quote: FileText,
  order: Truck,
  invoice: Receipt,
  company: Building2,
  product: Package,
  task: ListChecks,
  chat: MessageCircle,
};
const TYPE_LABEL: Record<string, string> = { deal: "Deal", quote: "Quote", order: "Order", invoice: "Invoice", company: "Company", product: "Product", task: "Task", chat: "Message" };

const TONE: Record<CardTone, string> = {
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/15 text-red-700 dark:text-red-400",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

/**
 * A record (deal, quote, order, invoice, company, product, task, or a chat message) as a small live card: what it is,
 * where it stands, the money and the people, and a button to open it. People who may not see it get a locked card.
 */
export function RecordCard({ cardRef, from }: { cardRef: string; /** who sent it, for "ask … for access" */ from?: string | null }) {
  const show = useChatStore((s) => s.show);
  const q = useQuery({ queryKey: cardKey(cardRef), queryFn: () => loadCard(cardRef), staleTime: 60_000 });
  const type = cardRef.split(":")[0];
  const Icon = ICON[type] ?? FileText;
  const c = q.data;

  const shell = "w-full min-w-0 max-w-80 rounded-xl border bg-card text-card-foreground shadow-xs";
  if (q.isPending) return <div className={`${shell} h-16 animate-pulse`} aria-label="Loading card" />;
  if (!c || c.missing) {
    return (
      <div className={`${shell} flex items-center gap-2 p-2.5 text-xs text-muted-foreground`}>
        <Icon className="size-4" /> This {TYPE_LABEL[type]?.toLowerCase() ?? "record"} was deleted.
      </div>
    );
  }
  if (c.restricted) {
    return (
      <div className={`${shell} flex items-start gap-2 p-2.5 text-xs text-muted-foreground`}>
        <Lock className="mt-0.5 size-4 shrink-0" />
        <span>
          You cannot see this {TYPE_LABEL[type]?.toLowerCase() ?? "record"}.{from ? ` Ask ${from.split(" ")[0]} or an admin to add you.` : " Ask an admin to add you."}
        </span>
      </div>
    );
  }

  const open =
    c.type === "chat" && c.channelId ? (
      <button type="button" onClick={() => show({ kind: "channel", id: c.channelId! })} className="font-medium text-primary hover:underline">
        Open conversation
      </button>
    ) : c.href ? (
      <Link href={c.href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
        Open {TYPE_LABEL[c.type]?.toLowerCase()} <SquareArrowOutUpRight className="size-3" />
      </Link>
    ) : null;

  return (
    <div className={`${shell} grid gap-1.5 p-2.5`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-semibold" title={c.title}>
            {c.title}
          </p>
          {c.subtitle && (
            <p className="truncate text-xs text-muted-foreground" title={c.subtitle}>
              {c.subtitle}
            </p>
          )}
        </div>
        {c.status && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONE[c.status.tone]}`}>{c.status.label}</span>}
      </div>
      {(c.amount || c.facts?.length || c.people?.length) && (
        <div className="flex items-center gap-2 text-xs">
          {c.amount && <span className="font-semibold tabular-nums">{c.amount}</span>}
          {c.facts?.map((f) => (
            <span key={f} className="truncate text-muted-foreground">
              {f}
            </span>
          ))}
          {c.people && c.people.length > 0 && (
            <span className="ml-auto">
              <AvatarStack users={c.people} size={18} />
            </span>
          )}
        </div>
      )}
      {open && <div className="text-xs">{open}</div>}
    </div>
  );
}
