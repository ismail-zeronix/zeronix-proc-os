import { guardSite, siteJson } from "@/lib/website/site-key";
import { customerFromToken, customerOrders, getCustomer, updateCustomer } from "@/lib/website/store";
import { profileSchema } from "@/lib/website/store-core";

async function who(req: Request) {
  return customerFromToken(req.headers.get("x-customer-token"));
}

/** The signed-in customer's profile and orders (token in x-customer-token). */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const id = await who(req);
  const c = id ? await getCustomer(id) : null;
  if (!c) return siteJson({ error: "Not signed in" }, 401);
  const orders = await customerOrders(c.id);
  return siteJson({
    customer: { email: c.email, name: c.name, phone: c.phone, company: c.company, trn: c.trn, address: c.address },
    orders: orders.map((o) => ({ number: o.number, status: o.status, total: o.total, payment: o.payment, items: o.items.map((i) => ({ name: i.name, qty: i.qty })), createdAt: o.createdAt.toISOString() })),
  });
}

export async function PUT(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const id = await who(req);
  if (!id) return siteJson({ error: "Not signed in" }, 401);
  const parsed = profileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return siteJson({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, 400);
  await updateCustomer(id, parsed.data);
  return siteJson({ ok: true });
}
