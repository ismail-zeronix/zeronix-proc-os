import "server-only";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { aiProvider } from "./ai";

export interface Check {
  ok: boolean;
  detail: string;
}

export interface MailboxLogin {
  username: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

function mailProblem(e: unknown, what: "SMTP" | "IMAP"): string {
  const err = e as { responseCode?: number; code?: string; authenticationFailed?: boolean; message?: string };
  if (err.responseCode === 535 || err.code === "EAUTH" || err.authenticationFailed) return `The ${what} server refused the login. Check the address and password.`;
  if (err.code === "ENOTFOUND" || err.code === "EDNS" || /ENOTFOUND|EAI_AGAIN/.test(err.message ?? "")) return `The ${what} server name was not found. Check the host.`;
  if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET") return `Could not reach the ${what} server. Check the host and port.`;
  return `${what}: ${err.message ?? "unknown problem"}`;
}

/** Logs in to SMTP (to send) and IMAP (to read replies) without sending anything. */
export async function testMailbox(m: MailboxLogin): Promise<Check> {
  const transport = nodemailer.createTransport({
    host: m.smtpHost,
    port: m.smtpPort,
    secure: m.smtpPort === 465,
    auth: { user: m.username, pass: m.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.verify();
  } catch (e) {
    return { ok: false, detail: mailProblem(e, "SMTP") };
  } finally {
    transport.close();
  }
  const client = new ImapFlow({ host: m.imapHost, port: m.imapPort, secure: true, auth: { user: m.username, pass: m.password }, logger: false, connectionTimeout: 15_000, socketTimeout: 20_000 });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true });
  } catch (e) {
    return { ok: false, detail: mailProblem(e, "IMAP") };
  } finally {
    await client.logout().catch(() => client.close());
  }
  return { ok: true, detail: "Sending and reading both work." };
}

export interface AiLogin {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** Asks the service for its model list (free, no tokens used) and checks the chosen model is on it. */
export async function testAi(a: AiLogin): Promise<Check> {
  const def = aiProvider(a.provider);
  if (!def) return { ok: false, detail: "Unknown provider." };
  const base = trimSlash(a.baseUrl || def.baseUrl);
  if (!base) return { ok: false, detail: "Enter the service's base URL." };
  let url: string;
  const headers: Record<string, string> = {};
  switch (def.key) {
    case "anthropic":
      url = `${base}/v1/models?limit=100`;
      headers["x-api-key"] = a.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "gemini":
      url = `${base}/models?key=${encodeURIComponent(a.apiKey)}&pageSize=200`;
      break;
    case "ollama":
      url = `${base}/api/tags`;
      break;
    default:
      url = `${base}/models`;
      if (a.apiKey) headers.Authorization = `Bearer ${a.apiKey}`;
  }
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    return { ok: false, detail: `Could not reach ${new URL(base).host}. Check the address and the internet connection.` };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, detail: "The service refused the API key." };
  if (!res.ok) return { ok: false, detail: `The service answered ${res.status}. Check the base URL.` };
  const body = (await res.json().catch(() => null)) as { data?: { id?: string }[]; models?: { name?: string }[] } | null;
  const ids = [...(body?.data ?? []).map((m) => m.id ?? ""), ...(body?.models ?? []).map((m) => (m.name ?? "").replace(/^models\//, ""))].filter(Boolean);
  if (!a.model) return { ok: true, detail: `Connected. ${ids.length} models available; pick one.` };
  if (ids.length && !ids.includes(a.model)) {
    const close = ids.filter((i) => i.includes(a.model.split(/[-:]/)[0])).slice(0, 4);
    return { ok: false, detail: `Connected, but "${a.model}" is not on this account's model list.${close.length ? ` Similar: ${close.join(", ")}.` : ""}` };
  }
  return { ok: true, detail: `Connected; ${a.model} is available.` };
}
