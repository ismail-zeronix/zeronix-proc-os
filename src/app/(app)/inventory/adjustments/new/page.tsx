import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { requireAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { stockItemOptions, stockStartInfo } from "@/lib/inventory/data";
import { currentOrgId } from "@/lib/org";
import { addDays } from "@/lib/quotation";
import { AdjustmentForm } from "../../stock-ui";

export const metadata = { title: "New stock adjustment · Zeronix Inventory" };

export default async function NewAdjustmentPage() {
  await requireAccountant();
  const orgId = await currentOrgId();
  const [start, items] = await Promise.all([stockStartInfo(orgId), stockItemOptions(orgId)]);
  const today = dubaiToday();
  const minDate = [start.stockStart, start.lockDate ? addDays(start.lockDate, 1) : null].filter((d): d is string => !!d).sort().pop() ?? today;
  return (
    <div className="grid max-w-4xl gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback="/inventory/adjustments" />
        <h1 className="text-base font-semibold">New stock adjustment</h1>
      </div>
      {start.stockStart ? (
        <AdjustmentForm today={today} minDate={minDate} items={items} />
      ) : (
        <p className="rounded-lg border p-4 text-sm">
          Stock has not started yet. Start it with the opening count in{" "}
          <Link href="/inventory/settings#start" className="underline">
            Inventory › Settings
          </Link>
          .
        </p>
      )}
    </div>
  );
}
