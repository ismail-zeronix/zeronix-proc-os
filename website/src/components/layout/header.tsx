import { Action } from "@/components/brand/action";
import { Logo } from "@/components/brand/logo";
import { QuoteListLink } from "@/components/quote/quote-buttons";
import type { SiteBrand, SiteNavResponse } from "@/lib/contract";
import { MegaMenu } from "./mega-menu";
import { MobileNav } from "./mobile-nav";

/** Sticky paper header: logo, mega menu (from the portal's catalog), the lime B2B action, the phone menu. */
export function Header({ brand, nav }: { brand: SiteBrand; nav: SiteNavResponse }) {
  return (
    <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-xl">
      <div className="container-site flex h-[4.5rem] items-center gap-4">
        <Logo />
        <div className="flex flex-1 justify-center">
          <MegaMenu nav={nav} ctaLabel={brand.ctaLabel} />
        </div>
        <div className="flex items-center gap-2">
          {/* the shop adds search and account here, and the quote list becomes the cart (WEBSITE-PLAN.md section 11) */}
          <QuoteListLink />
          <Action href="/quote" className="hidden sm:inline-flex" track="header">
            {brand.ctaLabel}
          </Action>
          <MobileNav nav={nav} ctaLabel={brand.ctaLabel} />
        </div>
      </div>
    </header>
  );
}
