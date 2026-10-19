import { Suspense } from "react";
import { CompareClient } from "./compare-client";

export const metadata = { title: "Compare prices · Zeronix Procurement" };

export default function ComparePage() {
  return (
    <Suspense>
      <CompareClient />
    </Suspense>
  );
}
