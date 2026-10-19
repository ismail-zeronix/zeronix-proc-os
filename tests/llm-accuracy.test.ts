/**
 * Accuracy check against the real local model. Slow (minutes on CPU), so opt-in:
 *   RUN_LLM_TESTS=true npx vitest run tests/llm-accuracy.test.ts
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getLlm } from "@/lib/llm";
import { cpuToken, norm } from "@/lib/parse/match";
import { parsePriceList } from "@/lib/parse/pipeline";

const expected = JSON.parse(readFileSync("tests/fixtures/aman-star-2026-10-19.expected.json", "utf8")) as {
  brand: string; part: string; cpu: string; ram: number; price: number;
}[];

describe.runIf(process.env.RUN_LLM_TESTS === "true")("local LLM extraction", () => {
  it("reads the Aman Star sample with >= 90% field accuracy", async () => {
    const drafts = await parsePriceList(readFileSync("tests/fixtures/aman-star-2026-10-19.txt", "utf8"), {
      llm: getLlm(process.env.LLM_MODEL),
    });
    expect(drafts).toHaveLength(expected.length);

    let ok = 0;
    let total = 0;
    const misses: string[] = [];
    expected.forEach((e, i) => {
      const d = drafts[i];
      const checks: [string, boolean][] = [
        ["brand", d.brand === e.brand],
        ["price", d.price === e.price],
        ["ram", d.ramGb === e.ram],
        ["cpu", cpuToken(d.cpu) === e.cpu],
        // part number may come with or without its "15-" prefix
        ["part", !e.part || norm(d.partNumber).endsWith(norm(e.part)) || norm(d.modelName).includes(norm(e.part))],
      ];
      for (const [name, pass] of checks) {
        total++;
        if (pass) ok++;
        else misses.push(`#${i} ${name}: got ${JSON.stringify(d)}`);
      }
    });
    const prices = expected.filter((e, i) => drafts[i].price === e.price).length;
    console.log(`accuracy ${ok}/${total}, prices ${prices}/${expected.length}`);
    if (misses.length) console.log(misses.join("\n"));
    expect(prices).toBe(expected.length);
    expect(ok / total).toBeGreaterThanOrEqual(0.9);
  });
});
