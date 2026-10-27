import "server-only";
import { isPunchedIn, loadAccess, NOT_PUNCHED_IN, type Access } from "@/lib/auth/session";

/**
 * For chat server actions: the signed-in, punched-in user. Chat is for every active user (not an app the admin
 * switches on per person); reading only needs a session, sending needs a punch-in like every other change.
 */
export async function assertChat(): Promise<Access> {
  const access = await loadAccess();
  if (!access) throw new Error("You are not signed in.");
  if (!(await isPunchedIn(access.user.id))) throw new Error(NOT_PUNCHED_IN);
  return access;
}
