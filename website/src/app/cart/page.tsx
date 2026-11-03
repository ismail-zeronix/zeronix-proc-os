import type { Metadata } from "next";
import { CartView } from "@/components/store/cart-view";

export const metadata: Metadata = { title: "Cart", robots: { index: false, follow: false } };

export default function CartPage() {
  return (
    <section className="container-site grid gap-4 py-5 sm:py-6">
      <h1 className="text-h2">Your cart</h1>
      <CartView />
    </section>
  );
}
