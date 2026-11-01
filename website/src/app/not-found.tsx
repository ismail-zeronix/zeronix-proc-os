import Link from "next/link";
import { Action } from "@/components/brand/action";

/** Any address the site does not have. Points back to the three ways in: industries, products and B2B pricing. */
export default function NotFound() {
  return (
    <section className="container-site grid min-h-[50vh] content-center justify-items-start gap-5 py-16">
      <p className="text-sm font-semibold tracking-wide text-forest-700 uppercase">Page not found</p>
      <h1 className="max-w-2xl text-h2">We could not find that page.</h1>
      <p className="max-w-xl text-lead text-muted-ink">It may have moved. Start from your industry, browse the products, or ask us directly for B2B pricing.</p>
      <div className="flex flex-wrap gap-3">
        <Action href="/industries">Find your industry</Action>
        <Action href="/products" variant="dark">
          Browse products
        </Action>
        <Link href="/quote" className="self-center text-sm font-semibold text-forest-700 underline underline-offset-2">
          Get B2B pricing
        </Link>
      </div>
    </section>
  );
}
