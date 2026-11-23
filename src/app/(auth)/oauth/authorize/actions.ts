"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { loadAccess } from "@/lib/auth/session";
import { checkAuthorizeRequest, issueCode } from "@/lib/mcp/oauth";
import { parseScope, scopeText } from "@/lib/mcp/oauth-rules";

function backTo(redirectUri: string, params: Record<string, string>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * Allow or Deny on the consent page. Everything is checked again here, because the form can be edited in the browser.
 * Problems come back as { error } so the page can show them; success leaves for Claude with redirect().
 */
export async function decideClaude(_prev: { error: string } | undefined, form: FormData): Promise<{ error: string }> {
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const challenge = String(form.get("code_challenge") ?? "");
  const client = await checkAuthorizeRequest(clientId, redirectUri);
  if (!client) return { error: "This sign-in link is not valid. Start again from Claude." };

  if (form.get("decision") !== "allow") redirect(backTo(redirectUri, { error: "access_denied", state }));

  const access = await loadAccess();
  if (!access || access.user.role !== "admin") return { error: "Only admins can connect Claude." };
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return { error: "This sign-in link is not valid. Start again from Claude." };

  const scope = scopeText(parseScope(form.get("write") === "on" ? "read write" : "read"));
  const code = await issueCode({ userId: access.user.id, userSv: access.user.sv, clientId, scope, redirectUri, codeChallenge: challenge });
  await audit(db, {
    userId: access.user.id,
    action: "claude.connect",
    entity: "mcp_client",
    summary: `Connected ${client.name || "Claude"} (${scope === "read" ? "read only" : "read and write"})`,
  });
  redirect(backTo(redirectUri, { code, state }));
}
