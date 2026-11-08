import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export interface LoginUser {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  role: "admin" | "sales";
  passwordHash: string;
  isActive: boolean;
  sessionVersion: number;
  /** The user's organisation is active (not paused from the platform console). */
  orgActive: boolean;
}

/**
 * The user signing in with this email, whichever organisation they belong to. Row-level security hides users of other
 * organisations from every other query, so this goes through the app_login_user() database function (migration 0064).
 */
export async function loginUser(email: string): Promise<LoginUser | null> {
  const r = await db.execute<{ id: number; organization_id: number; name: string; email: string; role: string; password_hash: string; is_active: boolean; session_version: number; org_active: boolean }>(
    sql`SELECT * FROM app_login_user(${email})`,
  );
  const u = r.rows[0];
  if (!u) return null;
  return {
    id: u.id,
    organizationId: u.organization_id,
    name: u.name,
    email: u.email,
    role: u.role === "admin" ? "admin" : "sales",
    passwordHash: u.password_hash,
    isActive: u.is_active,
    sessionVersion: u.session_version,
    orgActive: u.org_active,
  };
}
