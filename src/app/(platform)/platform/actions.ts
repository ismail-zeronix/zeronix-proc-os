"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UserError } from "@/lib/user-error";
import { assertPlatform } from "@/platform/session";
import { createTenant, enterTenant, newInvite, setTenantPlan, setTenantStatus } from "@/platform/tenants";

/** What a console form gets back: production builds hide thrown messages, so they come back as `error`. */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("[platform]", e);
    // a redirect (Next) must go through; anything else unexpected stays in the server log
    if (typeof (e as { digest?: unknown })?.digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
    return { ok: false, error: "Something went wrong. The details are in the server log." };
  }
}

const id = z.number().int().positive();
const newTenantSchema = z.object({
  name: z.string().trim().min(2, "Enter the company name").max(160),
  legalName: z.string().trim().max(200).default(""),
  trn: z.string().trim().max(30).default(""),
  emirate: z.string().trim().max(40).default("dubai"),
  adminName: z.string().trim().min(2, "Enter the first admin's name").max(120),
  adminEmail: z.string().trim().toLowerCase().email("Enter the first admin's email"),
  userLimit: z.number().int().min(1).max(10_000).nullable().default(null),
});

export async function createTenantAction(input: z.input<typeof newTenantSchema>) {
  return run(async () => {
    const admin = await assertPlatform();
    const d = newTenantSchema.safeParse(input);
    if (!d.success) throw new UserError(d.error.issues[0]?.message ?? "Check the form.");
    const r = await createTenant(admin, d.data);
    revalidatePath("/platform");
    return r;
  });
}

export async function setStatusAction(orgId: number, status: "active" | "suspended", reason: string) {
  return run(async () => {
    const admin = await assertPlatform();
    await setTenantStatus(admin, id.parse(orgId), z.enum(["active", "suspended"]).parse(status), z.string().max(500).parse(reason));
    revalidatePath(`/platform/tenants/${orgId}`);
    revalidatePath("/platform");
    return {};
  });
}

export async function setPlanAction(orgId: number, plan: { apps: string[] | null; userLimit: number | null }) {
  return run(async () => {
    const admin = await assertPlatform();
    await setTenantPlan(admin, id.parse(orgId), { apps: plan.apps === null ? null : z.array(z.string().max(40)).max(40).parse(plan.apps), userLimit: plan.userLimit == null ? null : z.number().int().parse(plan.userLimit) });
    revalidatePath(`/platform/tenants/${orgId}`);
    return {};
  });
}

export async function inviteAction(orgId: number, input: { email: string; name: string; role: "admin" | "sales" }) {
  return run(async () => {
    const admin = await assertPlatform();
    const r = await newInvite(admin, id.parse(orgId), { email: z.string().max(200).parse(input.email), name: z.string().max(120).parse(input.name), role: z.enum(["admin", "sales"]).parse(input.role) });
    revalidatePath(`/platform/tenants/${orgId}`);
    return { url: r.url, expiresAt: r.expiresAt.toISOString() };
  });
}

/** Opens the organisation in this browser (support visit); on success the browser goes to its home page. */
export async function enterAction(orgId: number, readOnly: boolean, reason: string) {
  const r = await run(async () => {
    const admin = await assertPlatform();
    await enterTenant(admin, id.parse(orgId), { readOnly: z.boolean().parse(readOnly), reason: z.string().max(500).parse(reason) });
    return {};
  });
  if (r.ok) redirect("/");
  return r;
}
