import "server-only";
import { randomUUID } from "node:crypto";
import type { NomodStatus, nomodCheckoutBody } from "./nomod-core";

/**
 * Nomod Hosted Checkout (online card, Apple Pay, Google Pay, Tabby, Tamara) for the site's "Pay online now".
 * The key lives in NOMOD_API_KEY on the portal only; the site never sees it. Docs:
 * https://nomod.com/docs/api-reference/authentication (X-API-KEY header), create-checkout, retrieve-checkout.
 *
 * A key starting with "sk_test_dummy" is TEST MODE without Nomod: checkouts open the site's own test-payment page
 * (/checkout/test-payment) where Pay / Fail / Cancel can be clicked, and the result is kept in memory. A real key
 * never reaches that page.
 */

export interface NomodCheckout {
  id: string;
  url: string;
  status: NomodStatus;
}

const BASE = () => (process.env.NOMOD_API_URL || "https://api.nomod.com/v1").replace(/\/$/, "");
const key = () => process.env.NOMOD_API_KEY?.trim() ?? "";

export const nomodConfigured = () => key().length > 10;
export const nomodTestMode = () => key().startsWith("sk_test_dummy");

export class NomodError extends Error {}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    method: init.method,
    headers: { "X-API-KEY": key(), "Content-Type": "application/json", Accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  }).catch((e: Error) => {
    throw new NomodError(`Nomod could not be reached: ${e.message}`);
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const detail = data ? JSON.stringify(data).slice(0, 300) : res.statusText;
    throw new NomodError(`Nomod ${init.method} ${path} answered ${res.status}: ${detail}`);
  }
  return data as T;
}

const asStatus = (s: unknown): NomodStatus => (s === "paid" || s === "cancelled" || s === "expired" ? s : "created");

// ---------- test mode (dummy key) ----------

const mock = globalThis as unknown as { __nomodMock?: Map<string, NomodStatus> };
const mockStore = () => (mock.__nomodMock ??= new Map());

/** Test mode: what the test-payment page clicked. False when the id is not a test checkout. */
export function setTestResult(id: string, status: NomodStatus): boolean {
  if (!nomodTestMode() || !mockStore().has(id)) return false;
  mockStore().set(id, status);
  return true;
}

// ---------- the API ----------

/** Opens a Hosted Checkout; the customer is sent to `url`. */
export async function createCheckout(body: ReturnType<typeof nomodCheckoutBody>, siteUrl: string): Promise<NomodCheckout> {
  if (!nomodConfigured()) throw new NomodError("Online payment is not set up (NOMOD_API_KEY).");
  if (nomodTestMode()) {
    const id = `test_${randomUUID()}`;
    mockStore().set(id, "created");
    const u = new URL("/checkout/test-payment", siteUrl);
    u.search = new URLSearchParams({ id, amount: body.amount, ref: body.reference_id, ok: body.success_url, fail: body.failure_url, cancel: body.cancelled_url }).toString();
    return { id, url: u.toString(), status: "created" };
  }
  const r = await call<{ id: string; url: string; status: unknown }>("/checkout", { method: "POST", body });
  if (!r?.id || !r.url) throw new NomodError("Nomod did not return a checkout link.");
  return { id: r.id, url: r.url, status: asStatus(r.status) };
}

/** The checkout as Nomod has it now: the only proof that an order was paid. */
export async function getCheckout(id: string): Promise<{ status: NomodStatus; amount: number }> {
  if (id.startsWith("test_")) {
    if (!nomodTestMode()) return { status: "expired", amount: 0 };
    return { status: mockStore().get(id) ?? "expired", amount: NaN };
  }
  const r = await call<{ status: unknown; amount: unknown }>(`/checkout/${encodeURIComponent(id)}`, { method: "GET" });
  return { status: asStatus(r?.status), amount: Number(r?.amount) };
}
