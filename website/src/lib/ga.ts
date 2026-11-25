"use client";

import { sessionUtm } from "./track";

/**
 * Google Analytics 4 lead events (the gtag loaded in app/layout.tsx from GA_MEASUREMENT_ID, live site only).
 * Key events to mark in GA4 (Admin › Events): generate_lead, whatsapp_click, phone_click.
 * Every event carries page_path, the product when the visitor is on (or asking about) one, and this session's
 * utm_source / utm_medium / utm_campaign. Before gtag has loaded the event waits in dataLayer; with no GA (local,
 * test) nothing happens.
 */

type Gtag = (command: "event", name: string, params: Record<string, string>) => void;

/** The product slug of a /products/{category}/{slug} page, else "". */
export function productOnPage(path = location.pathname): string {
  const m = /^\/products\/[^/]+\/([^/?#]+)/.exec(path);
  return m ? decodeURIComponent(m[1]) : "";
}

export function gaEvent(name: "generate_lead" | "whatsapp_click" | "phone_click", params: { product?: string; form_name?: string } = {}) {
  if (typeof window === "undefined") return;
  const utm = sessionUtm();
  const all: Record<string, string> = {
    page_path: location.pathname,
    ...(params.form_name ? { form_name: params.form_name } : {}),
    ...(params.product ? { product: params.product.slice(0, 100) } : {}),
    ...(utm.source ? { utm_source: utm.source } : {}),
    ...(utm.medium ? { utm_medium: utm.medium } : {}),
    ...(utm.campaign ? { utm_campaign: utm.campaign } : {}),
  };
  const w = window as unknown as { gtag?: Gtag };
  // gtag loads lazily (after the page has loaded): wait for it up to 15 s so the event never lands before GA's config
  let tries = 0;
  const fire = () => {
    if (typeof w.gtag === "function") return w.gtag("event", name, all);
    if (++tries < 30) setTimeout(fire, 500);
  };
  fire();
}
