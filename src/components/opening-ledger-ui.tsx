"use client";

import { FileUp, ListChecks, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { postExisting, postOpeningBalances, previewExistingDocuments, readTrialBalance, setCutover, type TbPreview } from "@/app/(app)/accounts/opening-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/ledger/coa-templates";
import { amount, sourceLabel } from "@/lib/ledger/journal";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { errorText } from "@/lib/user-error";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<T>, ok: string | ((r: T) => string), after?: (r: T) => void) =>
    start(async () => {
      try {
        const r = await fn();
        toast.success(typeof ok === "function" ? ok(r) : ok);
        after?.(r);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  return [pending, run] as const;
}

/** The day the ledger starts. Locked once documents or opening balances are posted. */
export function CutoverForm({ value, locked }: { value: string | null; locked: boolean }) {
  const [pending, run] = useRun();
  const [d, setD] = useState(value ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" className="w-44" value={d} disabled={locked} onChange={(e) => setD(e.target.value)} aria-label="Cut-over date" />
      {!locked && (
        <Button size="sm" pending={pending} disabled={!d || d === value} onClick={() => run(() => setCutover(d), "Cut-over date saved")}>
          <Save /> Save
        </Button>
      )}
    </div>
  );
}

export interface MapAccount {
  id: number;
  code: string;
  name: string;
  type: AccountType;
}

/**
 * Zoho's trial balance in, one opening entry out: read the file, check or change the account each Zoho line goes to,
 * compare receivables and payables with the portal's open invoices and bills, then post.
 */
export function TrialBalanceImport({ accounts, arId, apId }: { accounts: MapAccount[]; arId: number; apId: number }) {
  const [pending, run] = useRun();
  const [data, setData] = useState<TbPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const set = (i: number, accountId: number | null) => setData((d) => (d ? { ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, accountId } : r)) } : d));

  if (!data) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" accept=".xlsx,.csv" className="max-w-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Trial balance file" />
        <Button
          size="sm"
          pending={pending}
          disabled={!file}
          onClick={() => {
            const f = new FormData();
            f.set("file", file as File);
            run(() => readTrialBalance(f), (r) => `${r.rows.length} lines read`, setData);
          }}
        >
          <FileUp /> Read file
        </Button>
        <span className="text-xs text-muted-foreground">Zoho Books › Reports › Trial Balance, as of the day before the cut-over, exported as XLSX or CSV.</span>
      </div>
    );
  }

  const tot = (k: "debit" | "credit") => fromMinor(sumMinor(data.rows.map((r) => toMinor(r[k]))));
  const debit = tot("debit");
  const credit = tot("credit");
  const mappedTo = (id: number) => fromMinor(sumMinor(data.rows.filter((r) => r.accountId === id).map((r) => toMinor(r.debit) - toMinor(r.credit))));
  const portalAr = fromMinor(sumMinor(data.customers.map((c) => toMinor(c.amount))));
  const portalAp = fromMinor(sumMinor(data.suppliers.map((c) => toMinor(c.amount))));
  const zohoAr = mappedTo(arId);
  const zohoAp = -mappedTo(apId);
  const missing = data.rows.filter((r) => !r.accountId).length;

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-2 py-2 text-left font-medium">Zoho account</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Debit</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Credit</th>
              <th className="w-[22rem] px-2 py-2 text-left font-medium">Goes to</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className={`border-b last:border-0 ${r.accountId ? "" : "bg-amber-500/10"}`}>
                <td className="px-2 py-1.5">
                  {r.name}
                  {r.code && <span className="ml-1 font-mono text-xs text-muted-foreground">{r.code}</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.debit ? amount(r.debit) : ""}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.credit ? amount(r.credit) : ""}</td>
                <td className="px-2 py-1.5">
                  <NativeSelect size="sm" className="w-full" value={r.accountId ? String(r.accountId) : ""} onChange={(e) => set(i, e.target.value ? Number(e.target.value) : null)} aria-label={`Our account for ${r.name}`}>
                    <NativeSelectOption value="">Pick our account…</NativeSelectOption>
                    {ACCOUNT_TYPES.map((t) => (
                      <NativeSelectOptGroup key={t.key} label={t.plural}>
                        {accounts
                          .filter((a) => a.type === t.key)
                          .map((a) => (
                            <NativeSelectOption key={a.id} value={String(a.id)}>
                              {a.code} · {a.name}
                            </NativeSelectOption>
                          ))}
                      </NativeSelectOptGroup>
                    ))}
                  </NativeSelect>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40 font-medium">
              <td className="px-2 py-2">Total{debit !== credit && <span className="ml-2 text-destructive">off by {amount(Math.abs(debit - credit))}: the difference goes to Opening balance equity</span>}</td>
              <td className="px-2 py-2 text-right tabular-nums">{amount(debit)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{amount(credit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { label: "Customers owe (receivables)", zoho: zohoAr, portal: portalAr, n: data.customers.length, who: "customers" },
          { label: "We owe suppliers (payables)", zoho: zohoAp, portal: portalAp, n: data.suppliers.length, who: "suppliers" },
        ].map((c) => {
          const diff = fromMinor(toMinor(c.zoho) - toMinor(c.portal));
          return (
            <div key={c.label} className="rounded-lg border p-3 text-sm">
              <div className="font-medium">{c.label}</div>
              <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-4 text-xs tabular-nums">
                <span className="text-muted-foreground">Zoho trial balance</span>
                <span className="text-right">{amount(c.zoho)}</span>
                <span className="text-muted-foreground">
                  Portal open documents ({c.n} {c.who})
                </span>
                <span className="text-right">{amount(c.portal)}</span>
                <span className={diff ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>{diff ? "Not matched (kept on the account without a name)" : "Matches"}</span>
                <span className="text-right">{diff ? amount(diff) : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setData(null)}>
          Another file
        </Button>
        {missing > 0 && <span className="text-sm text-amber-600 dark:text-amber-400">{missing} line{missing === 1 ? "" : "s"} still need an account.</span>}
        <span className="ml-auto text-xs text-muted-foreground">Dated the day before the cut-over. Reverse it from Journals to post again.</span>
        <Button
          pending={pending}
          disabled={missing > 0}
          onClick={() =>
            run(
              () => postOpeningBalances({ rows: data.rows.map((r) => ({ name: r.name, code: r.code, debit: r.debit, credit: r.credit, accountId: r.accountId as number })) }),
              (r) => `Opening balances posted as ${r.number}`,
            )
          }
        >
          <Send /> Post opening balances
        </Button>
      </div>
    </div>
  );
}

/** Posts every document since the cut-over that is not in the ledger yet, after showing what that would be. */
export function BackfillCard() {
  const [pending, run] = useRun();
  const [preview, setPreview] = useState<{ posted: number; byType: Record<string, number> } | null>(null);
  const list = (byType: Record<string, number>) =>
    Object.entries(byType)
      .map(([t, n]) => `${n} ${sourceLabel(t).toLowerCase()}${n === 1 ? "" : "s"}`)
      .join(", ");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" pending={pending} onClick={() => run(() => previewExistingDocuments(), (r) => (r.posted ? `${r.posted} entries to post` : "Everything is already posted"), setPreview)}>
        <ListChecks /> Check what is missing
      </Button>
      {preview && (
        <>
          <span className="text-sm">{preview.posted ? `Would post ${preview.posted} entries: ${list(preview.byType)}.` : "Every document since the cut-over is in the ledger."}</span>
          {preview.posted > 0 && (
            <Button size="sm" pending={pending} onClick={() => run(() => postExisting(), (r) => `${r.posted} entries posted`, () => setPreview(null))}>
              <Send /> Post them
            </Button>
          )}
        </>
      )}
    </div>
  );
}
