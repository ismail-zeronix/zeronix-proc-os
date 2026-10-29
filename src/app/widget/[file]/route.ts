import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves the website chat widget from the repo's `widget/` folder: the script the website loads, and a demo page to try
 * it. Kept outside src/ so it stays one plain file that can also be copied to the website as it is.
 */
const FILES: Record<string, string> = {
  "zeronix-chat.js": "application/javascript; charset=utf-8",
  "demo.html": "text/html; charset=utf-8",
};

export async function GET(_req: Request, ctx: RouteContext<"/widget/[file]">) {
  const { file } = await ctx.params;
  const type = FILES[file];
  if (!type) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(path.join(process.cwd(), "widget", file), "utf8");
    return new Response(body, {
      headers: {
        "Content-Type": type,
        // short, so a new version reaches the website within minutes
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
