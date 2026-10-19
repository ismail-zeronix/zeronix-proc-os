/**
 * Runs the parse pipeline on a text file against the configured Ollama model.
 *   npx tsx scripts/try-parse.ts tests/fixtures/aman-star-2026-10-19.txt [model]
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { getLlm } from "@/lib/llm";
import { parsePriceList } from "@/lib/parse/pipeline";

const file = process.argv[2] ?? "tests/fixtures/aman-star-2026-10-19.txt";
const llm = getLlm(process.argv[3]);
async function main() {
const t0 = Date.now();
const drafts = await parsePriceList(readFileSync(file, "utf8"), {
  llm,
  onProgress: (p) => console.error(`  ${p.done}/${p.total} blocks  ${((Date.now() - t0) / 1000).toFixed(1)}s`),
});
console.error(`\n${llm.model}: ${drafts.length} items in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
for (const d of drafts) {
  console.log(
    [d.category, d.brand, d.modelName, d.partNumber, d.cpu, d.ramGb, d.storage, d.display, d.os, d.extras, d.price ?? "—", d.flags.join("; ")]
      .map((x) => String(x ?? ""))
      .join(" | "),
  );
}
}
main().catch((e) => { console.error(e); process.exit(1); });
