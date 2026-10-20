/**
 * Reads a supplier's live-feed link (or a saved CSV) and prints what the sync would create, without
 * touching the database.   npm run try-feed -- <link-or-csv-file> [USD|AED]
 */
import { existsSync, readFileSync } from "node:fs";
import { resolveFeed } from "../src/lib/feed/fetch";
import { parseStockSheet } from "../src/lib/parse/stocksheet";

async function main() {
  const [src, currency = "USD"] = process.argv.slice(2);
  if (!src) throw new Error("Usage: npm run try-feed -- <link-or-csv-file> [currency]");
  const text = existsSync(src) ? readFileSync(src, "utf8") : (await resolveFeed(src)).text;
  const res = parseStockSheet(text, { currency });
  for (const d of res.drafts) {
    console.log(
      [
        `${d.brand} | ${d.modelName} | PN ${d.partNumber || "-"}`,
        `   ${d.cpu || "?"} | ${d.ramGb ?? "?"}GB | ${d.storage || "?"} | ${d.display || "-"} | ${d.gpu || "-"} | ${d.os || "-"} | ${d.extras || "-"}`,
        `   ${d.category} | ${d.price ?? "no price"} ${d.currency}${d.flags.length ? " | FLAGS: " + d.flags.join("; ") : ""}`,
      ].join("\n"),
    );
  }
  console.log(`\n${res.drafts.length} products, ${res.drafts.filter((d) => d.price != null).length} priced, ${res.skipped.length} skipped`);
  for (const w of res.warnings) console.log("warning:", w);
  for (const s of res.skipped) console.log(`skipped row ${s.row}: ${s.reason}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
