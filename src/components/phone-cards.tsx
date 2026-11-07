"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Phones: a list table shown as one small card per row instead of a table that scrolls sideways.
 *
 * The CSS (globals.css, `[data-cards]`, below md) does the layout; this labels the cells from the table header so every
 * value keeps its name: the first named column becomes the card's title, the other named columns become "label value"
 * lines, and unnamed cells (tick boxes, action buttons) sit on the title line. Columns hidden on phones stay hidden.
 * Rows that change later (paging, filters, live updates) are labelled again. Desktop is not touched.
 */
export function usePhoneCards(ref: RefObject<HTMLElement | null>, on = true) {
  useEffect(() => {
    const root = ref.current;
    if (!on || !root) return;
    const table = root.querySelector("table");
    if (!table) return;

    const label = () => {
      const head = table.tHead?.rows[table.tHead.rows.length - 1];
      const names: string[] = [];
      if (head) for (const th of Array.from(head.cells)) for (let i = 0; i < th.colSpan; i++) names.push(i ? "" : th.innerText.trim());
      // totals under the table read as "Subtotal  AED 100" on one line: their own label cell says what they are
      if (table.tFoot)
        for (const tr of Array.from(table.tFoot.rows))
          for (const td of Array.from(tr.cells)) {
            td.dataset.label = "";
            delete td.dataset.cardTitle;
            td.dataset.cardTotal = "";
          }
      for (const body of Array.from(table.tBodies)) {
        for (const tr of Array.from(body.rows)) {
          let col = 0;
          let titled = false;
          for (const td of Array.from(tr.cells)) {
            const name = names[col] ?? "";
            col += td.colSpan;
            delete td.dataset.cardTitle;
            delete td.dataset.cardBare;
            if (td.colSpan >= names.length && names.length > 1) {
              // a message across the whole table ("No quotes yet") or a group heading
              td.dataset.cardBare = "wide";
              continue;
            }
            if (!name) td.dataset.cardBare = "";
            else if (!titled) {
              titled = true;
              td.dataset.cardTitle = "";
            }
            td.dataset.label = name;
          }
        }
      }
    };

    label();
    const watch = new MutationObserver(label);
    watch.observe(table, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [ref, on]);
}

/** Wraps a plain <table> (not the shared Table) so it shows as cards on phones. */
export function PhoneCards({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  usePhoneCards(ref);
  return (
    <div ref={ref} data-cards="" className={className}>
      {children}
    </div>
  );
}
