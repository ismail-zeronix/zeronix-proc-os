import { Suspense } from "react";
import { requireApp } from "@/lib/auth/session";
import { CompareClient } from "./compare-client";

export const metadata = { title: "Compare prices · Zeronix" };

export default async function ComparePage() {
  await requireApp("procurement");
  return (
    <Suspense>
      <CompareClient />
    </Suspense>
  );
}
