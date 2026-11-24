import { z } from "zod";
import type { AppKey } from "@/lib/apps";
import type { Viewer } from "@/lib/auth/visibility";
import { parseInput } from "@/lib/user-error";
import type { McpAuth } from "./oauth";
import type { ToolInfo, ToolResult } from "./rpc";

/**
 * Who is calling and where the portal lives, for every tool. The viewer is the connected person's own data scope: an admin
 * or "All data" user sees everything, a salesperson only the deals they are on (lib/auth/visibility.ts).
 */
export interface McpCtx {
  auth: McpAuth;
  viewer: Viewer;
  /** https://zeronixos.online, for links back into the portal. */
  base: string;
}

export interface McpTool extends ToolInfo {
  /** Offered to this person at all (their apps / Accounts access)? Hidden tools are neither listed nor run. */
  allowed(auth: McpAuth): boolean;
  call(args: Record<string, unknown>, ctx: McpCtx): Promise<ToolResult>;
}

/** Tool rules by app: `app("crm", "sales")` = the person has at least one of these apps. */
export const app =
  (...keys: AppKey[]) =>
  (a: McpAuth) =>
    keys.some((k) => a.apps.includes(k));
/** Accounts app: money owed, bills, reports. */
export const finance = (a: McpAuth) => a.finance;

/** Plain JSON for Claude: dates as ISO strings, empty values left out to save tokens. */
function toPlain(data: unknown): Record<string, unknown> {
  const json = JSON.stringify(data, (_k, v) => (v === null || v === undefined || v === "" ? undefined : v));
  const parsed = JSON.parse(json ?? "{}") as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { items: parsed };
}

/** One tool: its input is checked with zod (the same schema is published to Claude as JSON Schema). */
export function defineTool<S extends z.ZodObject>(def: {
  name: string;
  title: string;
  description: string;
  write?: boolean;
  /** Who gets the tool; default everyone who may connect. */
  needs?: (a: McpAuth) => boolean;
  input: S;
  run(args: z.output<S>, ctx: McpCtx): Promise<unknown>;
}): McpTool {
  const schema = z.toJSONSchema(def.input, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: schema,
    write: !!def.write,
    allowed: (a) => (def.needs ? def.needs(a) : true),
    async call(args, ctx) {
      const data = toPlain(await def.run(parseInput(def.input, args), ctx));
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
    },
  };
}
