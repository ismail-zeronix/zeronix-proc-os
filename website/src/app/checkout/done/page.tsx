import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderDone } from "@/components/store/order-done";

export const metadata: Metadata = { title: "Order placed", robots: { index: false, follow: false } };

export default function OrderDonePage() {
  return (
    <section className="container-site py-8 sm:py-10">
      <Suspense>
        <OrderDone />
      </Suspense>
    </section>
  );
}
