import "server-only";
import { assertWritable, loadAccess, type Access } from "@/lib/auth/session";
import { UserError } from "@/lib/user-error";

/**
 * For chat server actions: the signed-in, punched-in user. Chat is for every active user (not an app the admin
 * switches on per person); reading only needs a session, sending needs a punch-in like every other change.
 */
export async function assertChat(): Promise<Access> {
  const access = await loadAccess();
  if (!access) throw new UserError("You are not signed in.");
  await assertWritable(access);
  return access;
}
