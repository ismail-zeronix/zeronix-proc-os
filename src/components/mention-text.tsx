import { Fragment } from "react";

/**
 * Text that may hold mentions (`@[Bina](user:12)`) and record links (`#[ZQ-2026-0012](quote:4)`): mentions read as
 * "@Bina" chips (yours highlighted), records as "#ZQ-2026-0012", web links are clickable. Works on server and client.
 */
export function MentionText({ body, me, inverse }: { body: string; me?: number; /** on a coloured bubble */ inverse?: boolean }) {
  const parts = body.split(/([@#]\[[^\]]+\]\((?:[a-z]+):\d+\)|https?:\/\/[^\s<]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        const token = /^([@#])\[([^\]]+)\]\(([a-z]+):(\d+)\)$/.exec(p);
        if (!token) {
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
              {p}
            </a>
          );
        }
        const [, sign, label, type, id] = token;
        if (sign === "@") {
          const mine = type === "user" && Number(id) === me;
          return (
            <span key={i} className={`rounded px-0.5 font-medium ${mine ? "bg-amber-400/40" : inverse ? "bg-white/20" : "bg-primary/10 text-primary dark:bg-primary/20"}`}>
              @{label}
            </span>
          );
        }
        return (
          <span key={i} className="font-medium underline decoration-dotted underline-offset-2">
            #{label}
          </span>
        );
      })}
    </>
  );
}
