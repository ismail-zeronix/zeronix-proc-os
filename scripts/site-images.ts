/**
 * Generates the public site's images with an image model on OpenRouter, using the OpenRouter key saved in
 * Prospecting › Settings › AI (stored encrypted; needs AUTH_SECRET and DATABASE_URL from .env). Prompts follow the
 * 5-part framework (type, subject, environment, camera, constraints) and website/BRAND.md section 7.
 *
 *   npx tsx scripts/site-images.ts --check                 key, credit left, nothing generated
 *   npx tsx scripts/site-images.ts [name ...]              generate (all missing, or only the named ones)
 *   npx tsx scripts/site-images.ts --force hero            generate again even if the file exists
 *
 * Files land in website/public/images/<name>.webp-ready PNG/JPEG as the model returns them; the site picks them up by
 * name (website/src/lib/images.ts).
 */
import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { decryptSecret } from "../src/lib/crypto";
import { SITE_IMAGES } from "./site-images.prompts";

const MODEL = process.env.SITE_IMAGE_MODEL ?? "google/gemini-3.1-flash-image";
const OUT = path.join(process.cwd(), "website", "public", "images");

async function openRouterKey(): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const [row] = await db
    .select({ key: schema.prospectAiProviders.apiKeyEnc })
    .from(schema.prospectAiProviders)
    .where(and(eq(schema.prospectAiProviders.provider, "openrouter"), eq(schema.prospectAiProviders.enabled, true)))
    .limit(1);
  await pool.end();
  if (!row?.key) throw new Error("No enabled OpenRouter provider with a key in Prospecting › Settings");
  return decryptSecret(row.key);
}

async function check(key: string) {
  const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
  const j = (await res.json()) as { data?: { label?: string; usage?: number; limit?: number | null; limit_remaining?: number | null; is_free_tier?: boolean } };
  console.log("key:", j.data?.label, "| used $", j.data?.usage, "| limit", j.data?.limit ?? "none", "| remaining", j.data?.limit_remaining ?? "n/a", "| free tier:", j.data?.is_free_tier);
  const c = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${key}` } });
  if (c.ok) {
    const cj = (await c.json()) as { data?: { total_credits?: number; total_usage?: number } };
    console.log("credits: bought $", cj.data?.total_credits, "| spent $", cj.data?.total_usage);
  }
}

async function generate(key: string, name: string, prompt: string, aspect: string) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Zeronix site images" },
    body: JSON.stringify({
      model: MODEL,
      modalities: ["image", "text"],
      image_config: { aspect_ratio: aspect },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const j = (await res.json()) as {
    error?: { message?: string };
    usage?: { cost?: number };
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  };
  if (!res.ok || j.error) throw new Error(`${res.status} ${j.error?.message ?? ""}`);
  const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
  const m = url.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) throw new Error("no image in the answer");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  writeFileSync(path.join(OUT, `${name}.${ext}`), Buffer.from(m[2], "base64"));
  console.log(`✓ ${name}.${ext}${j.usage?.cost != null ? ` ($${j.usage.cost.toFixed(4)})` : ""}`);
}

async function main() {
  const args = process.argv.slice(2);
  const key = await openRouterKey();
  if (args.includes("--check")) return check(key);
  const force = args.includes("--force");
  const only = args.filter((a) => !a.startsWith("--"));
  mkdirSync(OUT, { recursive: true });
  const todo = SITE_IMAGES.filter((i) => (only.length ? only.includes(i.name) : true)).filter(
    (i) => force || !["png", "jpg", "webp"].some((e) => existsSync(path.join(OUT, `${i.name}.${e}`))),
  );
  console.log(`${todo.length} image(s) with ${MODEL}`);
  for (const i of todo) {
    try {
      await generate(key, i.name, i.prompt, i.aspect);
    } catch (e) {
      console.error(`✗ ${i.name}: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
