import type { Metadata } from "next";
import { CheckoutForm } from "@/components/store/checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <section className="container-site grid gap-4 py-5 sm:py-6">
      <h1 className="text-h2">Checkout</h1>
      <CheckoutForm />
    </section>
  );
}
