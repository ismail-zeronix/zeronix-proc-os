import { Inbox } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { requireApp } from "@/lib/auth/session";
import { inboxCount } from "@/lib/procurement/intake";
import { HowStockComesIn } from "./how-stock";
import { SearchClient } from "./search-client";

export const metadata = { title: "Procurement · Zeronix" };

/** Procurement's home: search every supplier price, tick products, share a price with a customer. */
export default async function ProcurementSearchPage() {
  await requireApp("procurement");
  const waiting = await inboxCount();
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Supplier prices</h1>
        <span className="ml-auto flex items-center gap-2">
          {waiting > 0 && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/procurement/inbox" />}>
              <Inbox /> {waiting} to check
            </Button>
          )}
          <HowStockComesIn />
        </span>
      </div>
      <Suspense>
        <SearchClient />
      </Suspense>
    </div>
  );
}
