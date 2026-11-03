"use client";

import { X } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The Website app's lists: a checkbox on every row, "select all" for the page (and then for every matching row across
 * pages), and a bar fixed to the bottom of the screen with the selection's actions on the left and the pages on the
 * right. Rows and cells are rendered by the server page; bulk actions are client components that read the selection
 * with useSelection().
 */

export interface Selection {
  /** Ids picked on this page. */
  ids: number[];
  /** True when "all N matching" was chosen: the action should use the list's filter, not `ids`. */
  allMatching: boolean;
  /** How many rows the action covers. */
  count: number;
  clear: () => void;
}

const SelectionContext = createContext<Selection>({ ids: [], allMatching: false, count: 0, clear: () => {} });
export const useSelection = () => useContext(SelectionContext);

export interface Column {
  label: ReactNode;
  className?: string;
}

export function DataTable({
  columns,
  rows,
  total,
  noun,
  actions,
  pager,
  empty,
}: {
  columns: Column[];
  rows: { id: number; cells: ReactNode[] }[];
  /** Rows matching the filter on every page. */
  total: number;
  /** "product" → "3 products selected". */
  noun: string;
  /** Bulk actions (client components using useSelection), shown in the bottom bar while something is picked. */
  actions?: ReactNode;
  /** The Pager for this list (server-rendered links). */
  pager?: ReactNode;
  empty: ReactNode;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  // "all matching" belongs to the page it was chosen on; a new page or filter starts without it (and picks of rows
  // no longer shown drop out below)
  const key = rowIds.join(",");
  const [allMatchingOn, setAllMatchingOn] = useState<string | null>(null);
  const allMatching = allMatchingOn === key;
  const setAllMatching = (on: boolean) => setAllMatchingOn(on ? key : null);

  const ids = rowIds.filter((id) => picked.has(id));
  const pageAll = rows.length > 0 && ids.length === rows.length;
  const count = allMatching ? total : ids.length;
  const plural = (n: number) => `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "s"}`;
  const selection: Selection = {
    ids,
    allMatching,
    count,
    clear: () => {
      setPicked(new Set());
      setAllMatching(false);
    },
  };
  const toggle = (id: number) => {
    setAllMatching(false);
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <SelectionContext.Provider value={selection}>
      <div className="flex flex-1 flex-col gap-2">
        {pageAll && total > rows.length && (
          <p className="rounded-md bg-muted px-3 py-1.5 text-center text-xs">
            {allMatching ? (
              <>
                All {plural(total)} are selected.{" "}
                <button type="button" className="font-medium text-primary hover:underline" onClick={selection.clear}>
                  Clear selection
                </button>
              </>
            ) : (
              <>
                All {plural(rows.length)} on this page are selected.{" "}
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setAllMatching(true)}>
                  Select all {plural(total)}
                </button>
              </>
            )}
          </p>
        )}
        {/* a 0-wide grid column lets the table scroll inside its box instead of widening the page */}
        <div className="grid grid-cols-[minmax(0,1fr)]">
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-9">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={pageAll}
                    indeterminate={ids.length > 0 && !pageAll}
                    disabled={!rows.length}
                    onCheckedChange={(on) => {
                      setAllMatching(false);
                      setPicked(on ? new Set(rowIds) : new Set());
                    }}
                  />
                </TableHead>
                {columns.map((c, i) => (
                  <TableHead key={i} className={c.className}>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                    {empty}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} data-state={picked.has(r.id) || allMatching ? "selected" : undefined}>
                  <TableCell className="w-9">
                    <Checkbox aria-label="Select row" checked={picked.has(r.id) || allMatching} onCheckedChange={() => toggle(r.id)} />
                  </TableCell>
                  {r.cells.map((cell, i) => (
                    <TableCell key={i} className={columns[i]?.className}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </div>
        {/* fixed to the bottom of the screen: the selection's actions on the left, the pages on the right */}
        <div className={cn("sticky bottom-0 z-20 -mx-1 mt-auto flex min-h-12 flex-wrap items-center gap-2 border-t bg-background/95 py-2 pr-20 pl-1 backdrop-blur", count > 0 && "border-primary/40")}>
          {count > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium">{plural(count)} selected</span>
              {actions}
              <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={selection.clear}>
                <X />
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Tick rows to act on several at once</span>
          )}
          <div className="ml-auto">{pager}</div>
        </div>
      </div>
    </SelectionContext.Provider>
  );
}
