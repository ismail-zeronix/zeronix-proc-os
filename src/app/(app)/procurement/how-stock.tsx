"use client";

import { Info } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const CLAUDE_PROMPT =
  'Open WhatsApp and read the new supplier stock messages in "<group or chat name>". Push them to Zeronix OS with push_supplier_stock (check supplier_stock_status first so you only read new messages), then tell me what was saved and what needs a check.';

const STEPS: [string, string][] = [
  ["Claude reads WhatsApp", "In Chrome, open WhatsApp Web and ask Claude (with the Zeronix OS connector) to push a group's or chat's new stock messages."],
  ["Clear lines go straight in", "Suppliers are recognised by their WhatsApp number. The same broadcast sent again is not saved twice; its prices just stay fresh."],
  ["You check the rest", "Unknown senders and unclear lines wait in the Inbox. Say who the sender is once and their messages go in by themselves from then on."],
];

/** The three steps, and a prompt to paste into Claude. */
export function HowStockComesIn() {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="How stock comes in">
        <Info className="size-4" /> How stock comes in
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,24rem)] gap-3 p-3">
        <ol className="grid gap-2.5">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex gap-2.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{i + 1}</span>
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="grid gap-1.5 rounded-md bg-muted/60 p-2">
          <p className="text-xs whitespace-pre-line">{CLAUDE_PROMPT}</p>
          <div className="flex justify-end">
            <CopyButton text={CLAUDE_PROMPT} label="Copy prompt" size="xs" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Distributor Excel sheets: use the upload button next to the search box.</p>
      </PopoverContent>
    </Popover>
  );
}
