import type { Batch } from "@/lib/parse/chunk";

function ex(
  block: number, category: string, brand: string, model_name: string, part_number: string, cpu: string,
  ram: string, storage: string, display: string, gpu: string, os: string, extras: string, price: number | null,
) {
  return { block, category, brand, model_name, part_number, cpu, ram, storage, display, gpu, os, extras, price };
}

export interface FewShot {
  input: string;
  output: string; // JSON string of { items: [...] }
}

export const SYSTEM_PROMPT = `You extract IT product offers from supplier price-list messages (WhatsApp, UAE market).
Input is numbered blocks like "[#3] (section: Desktops)" followed by text.
Return JSON {"items":[...]} with one object per product offer.

Field rules (use "" when not mentioned, never invent):
- block: the number n of the [#n] block. A block can hold several products.
- category: laptop, desktop, workstation, all-in-one, monitor, accessory, component, printer, networking, storage or other. All-in-one PCs (ProOne, AIO, iMac) are all-in-one.
- brand: manufacturer in proper case (HP, Lenovo, Dell, ASUS, Acer, Apple, MSI...).
- model_name: series/name WITHOUT brand and WITHOUT part number ("OmniBook X Flip 14", "ProBook 440 G11", "IdeaPad Slim 3", "V15 Gen 5").
- part_number: manufacturer code if written ("FM0013DX", "15-FD0130WM", "15IRH10", "X1504VA"), upper case.
- cpu: normalised ("Core Ultra 5 226V", "Core i5-13420H", "Core 7 150U", "Ryzen 5 7520U"). "U7" = "Core Ultra 7", "u5 225u" = "Core Ultra 5 225U". Keep "Core 5"/"Core 7" as written (they are not i5/i7).
- ram: "16GB". "16/512" = 16GB RAM, 512GB storage.
- storage: "512GB SSD", "1TB". Copy typos as written.
- display: size and type ('14" 2K Touch', '15.6" FHD'). TS/TCH = Touch.
- os: "Win11 Home", "Win11 Pro", "DOS"...
- extras: other details (pen, Office 2024, warranty, RAM upgradeable, No DVD).
- price: number only ("@2850/-" -> 2850, "AED 1,500" -> 1500); null if the block has no price.
Skip greetings, headings, signatures and contact lines.`;

export function renderBatch(batch: Batch): string {
  return batch.blocks
    .map((b) => `[#${b.index}]${b.section ? ` (section: ${b.section})` : ""}\n${b.text}`)
    .join("\n\n");
}

const DEFAULT_EXAMPLE: FewShot = {
  input: `[#0]
HP 250 G10 - 8A5D5EA
i5-1335U | 8GB | 512GB | 15.6" FHD TS | DOS
AED 1,750

[#1]
Acer Aspire Lite AL14 Ultra 5 125H 16/512 14" WUXGA Win11 @2,150/-
Acer Aspire Lite AL14 Ultra 7 155H 16/1TB 14" WUXGA Win11 @2,600/-

[#2] (section: Desktops)
Dell Pro Tower QCT1250
Intel Core I7-14700/8GB/512GB/NO DVD/DOS/1y`,
  output: JSON.stringify({
    items: [
      ex(0, "laptop", "HP", "250 G10", "8A5D5EA", "Core i5-1335U", "8GB", "512GB", '15.6" FHD Touch', "", "DOS", "", 1750),
      ex(1, "laptop", "Acer", "Aspire Lite AL14", "", "Core Ultra 5 125H", "16GB", "512GB", '14" WUXGA', "", "Win11", "", 2150),
      ex(1, "laptop", "Acer", "Aspire Lite AL14", "", "Core Ultra 7 155H", "16GB", "1TB", '14" WUXGA', "", "Win11", "", 2600),
      ex(2, "desktop", "Dell", "Pro Tower", "QCT1250", "Core i7-14700", "8GB", "512GB", "", "", "DOS", "No DVD, 1y warranty", null),
    ],
  }),
};

export function buildMessages(batch: Batch, fewShots: FewShot[] = []) {
  const shots = [DEFAULT_EXAMPLE, ...fewShots.slice(0, 2)];
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...shots.flatMap((s) => [
      { role: "user" as const, content: s.input },
      { role: "assistant" as const, content: s.output },
    ]),
    { role: "user" as const, content: renderBatch(batch) },
  ];
}
