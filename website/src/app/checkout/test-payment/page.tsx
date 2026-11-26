import type { Metadata } from "next";
import { Suspense } from "react";
import { TestPayment } from "@/components/store/test-payment";

export const metadata: Metadata = { title: "Test payment", robots: { index: false, follow: false }, alternates: { canonical: "/checkout/test-payment" } };

/** Stands in for Nomod's payment page while the portal runs with a dummy key (lib/website/nomod.ts). */
export default function TestPaymentPage() {
  return (
    <section className="container-site py-8 sm:py-10">
      <Suspense>
        <TestPayment />
      </Suspense>
    </section>
  );
}
