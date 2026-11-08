import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { PLATFORM_COOKIE, PLATFORM_HOURS, signPlatform, verifyPlatform, type PlatformSession } from "@/lib/auth/platform-token";
import { ipFromHeaders } from "@/lib/client-ip";
import { UserError } from "@/lib/user-error";
import { platformDb, schema } from "./db";

/** The signed-in platform admin, checked against the database (still active, same session version), or null. */
export const loadPlatformAdmin = cache(async (): Promise<PlatformSession | null> => {
  const s = await verifyPlatform((await cookies()).get(PLATFORM_COOKIE)?.value);
  if (!s) return null;
  const [row] = await platformDb
    .select({ name: schema.platformAdmins.name, email: schema.platformAdmins.email, isActive: schema.platformAdmins.isActive, sv: schema.platformAdmins.sessionVersion })
    .from(schema.platformAdmins)
    .where(eq(schema.platformAdmins.id, s.id));
  if (!row?.isActive || row.sv !== s.sv) return null;
  return { id: s.id, name: row.name, email: row.email, sv: row.sv };
});

/** For /platform pages. */
export async function requirePlatform(): Promise<PlatformSession> {
  const a = await loadPlatformAdmin();
  if (!a) redirect("/platform/login");
  return a;
}

/** For platform server actions. */
export async function assertPlatform(): Promise<PlatformSession> {
  const a = await loadPlatformAdmin();
  if (!a) throw new UserError("Please sign in to the platform console again.");
  return a;
}

export async function setPlatformCookie(a: PlatformSession) {
  (await cookies()).set(PLATFORM_COOKIE, await signPlatform(a), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: PLATFORM_HOURS * 3600,
  });
}

/** One row of the platform's audit trail (tenants see the rows about their organisation in Admin). */
export async function platformAudit(e: { admin: PlatformSession; action: string; orgId?: number | null; summary: string; reason?: string }) {
  let ip = "";
  try {
    const { headers } = await import("next/headers");
    ip = ipFromHeaders(await headers());
  } catch {
    // scripts and tests have no request
  }
  await platformDb.insert(schema.platformAuditLog).values({
    organizationId: e.orgId ?? null,
    adminId: e.admin.id,
    adminName: e.admin.name,
    action: e.action,
    summary: e.summary.slice(0, 500),
    reason: (e.reason ?? "").slice(0, 500),
    ip,
  });
}
