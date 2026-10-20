"use client";

import { FileText, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { toBlocks } from "@/lib/parse/chunk";
import { detectSupplierName } from "@/lib/parse/preclean";
import { likelyPriceLists, looksLikeChatExport, parseChatExport, type ChatMessage } from "@/lib/parse/whatsapp";
import { ago } from "@/lib/format";
import { SUPPLIER_TYPES, supplierType } from "@/lib/supplier-types";
import { cn } from "@/lib/utils";
import { usePasteStore } from "@/stores/import-store";
import { createPriceList } from "./actions";

const NEW = "__new__";
const MAX_CHARS = 100_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function ImportForm({ suppliers }: { suppliers: { id: number; name: string; type: string }[] }) {
  // category of a supplier that is created by this paste: asked, never guessed
  const [newType, setNewType] = useState("");
  const router = useRouter();
  const [pending, start] = useTransition();
  const s = usePasteStore();
  // sessionStorage-backed store: render only on the client to avoid a hydration mismatch
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

  const blocks = useMemo(() => (s.rawText.trim() ? toBlocks(s.rawText).length : 0), [s.rawText]);
  const detected = useMemo(() => detectSupplierName(s.rawText), [s.rawText]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [chat, setChat] = useState<{ messages: ChatMessage[]; file: string } | null>(null);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return toast.error("That file is too big. Export the chat without media.");
    if (!/\.(txt|text|csv)$/i.test(file.name) && file.type && !file.type.startsWith("text/")) {
      return toast.error("Upload the .txt file from WhatsApp's “Export chat” (without media).");
    }
    const text = await file.text();
    if (looksLikeChatExport(text)) {
      const messages = parseChatExport(text);
      if (!messages.length) return toast.error("No messages found in that chat export.");
      setChat({ messages, file: file.name });
    } else {
      s.set({ rawText: text.slice(0, MAX_CHARS) });
      toast.success(`Loaded ${file.name}`);
      if (text.length > MAX_CHARS) toast.warning(`Only the first ${MAX_CHARS.toLocaleString()} characters were kept.`);
    }
  }

  function pickMessage(m: ChatMessage) {
    const patch: Parameters<typeof s.set>[0] = { rawText: m.text.slice(0, MAX_CHARS) };
    if (m.at) patch.receivedAt = m.at;
    // a signature in the text wins; otherwise a sender that is a name (not a phone number) is a good guess
    const name = detectSupplierName(m.text) ?? (/^[+\d\s()-]+$/.test(m.sender) ? null : m.sender);
    if (name) Object.assign(patch, supplierPatch(name));
    s.set(patch);
    setChat(null);
  }

  // An existing supplier whose name matches, else "new supplier" pre-filled with the name.
  const supplierPatch = (name: string) => {
    const lower = name.toLowerCase();
    const hit = suppliers.find((x) => x.name.toLowerCase() === lower || lower.includes(x.name.toLowerCase()));
    return hit ? { supplierId: String(hit.id) } : { supplierId: NEW, newSupplierName: name };
  };

  // Auto-pick the supplier from a signature like "Supplier : Aman Star IT DXB".
  useEffect(() => {
    if (!detected || s.supplierId) return;
    s.set(supplierPatch(detected));
  }, [detected]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () =>
    start(async () => {
      try {
        const { id, aiRunning } = await createPriceList({
          supplierId: s.supplierId && s.supplierId !== NEW ? Number(s.supplierId) : undefined,
          newSupplierName: s.supplierId === NEW ? s.newSupplierName : undefined,
          newSupplierType: s.supplierId === NEW ? newType : undefined,
          receivedAt: s.receivedAt || undefined,
          rawText: s.rawText,
        });
        s.reset();
        toast.success(
          aiRunning
            ? "Price list queued: the AI reads it at its next look"
            : "Price list saved and waiting: AI reading is stopped (an admin can start it in Admin)",
        );
        router.push(`/procurement/import/${id}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  if (!hydrated) return null;
  const canSubmit =
    s.rawText.trim().length >= 10 && (s.supplierId && (s.supplierId !== NEW || (s.newSupplierName.trim() && newType)));
  const chosenSupplier = suppliers.find((x) => String(x.id) === s.supplierId);

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="supplier">Supplier</Label>
            <NativeSelect id="supplier" value={s.supplierId} onChange={(e) => s.set({ supplierId: e.target.value })}>
              <NativeSelectOption value="">Choose supplier…</NativeSelectOption>
              {suppliers.map((x) => (
                <NativeSelectOption key={x.id} value={String(x.id)}>
                  {x.name} ({supplierType(x.type).short})
                </NativeSelectOption>
              ))}
              <NativeSelectOption value={NEW}>+ New supplier</NativeSelectOption>
            </NativeSelect>
            {chosenSupplier?.type === "other" && (
              <p className="text-xs text-muted-foreground">
                This supplier has no category yet. <Link href="/procurement/suppliers" className="underline">Set it on Suppliers</Link> so
                Compare can filter by market, stockist, free zone…
              </p>
            )}
          </div>
          {s.supplierId === NEW && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="newSupplier">New supplier name</Label>
                <Input
                  id="newSupplier"
                  value={s.newSupplierName}
                  onChange={(e) => s.set({ newSupplierName: e.target.value })}
                  placeholder="e.g. Aman Star IT DXB"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="newType">Category</Label>
                <NativeSelect id="newType" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  <NativeSelectOption value="">Choose category…</NativeSelectOption>
                  {SUPPLIER_TYPES.map((t) => (
                    <NativeSelectOption key={t.key} value={t.key}>
                      {t.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="receivedAt">Received on</Label>
            <Input
              id="receivedAt"
              type="datetime-local"
              value={s.receivedAt}
              onChange={(e) => s.set({ receivedAt: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Label htmlFor="raw">WhatsApp message</Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {blocks ? `${blocks} item block${blocks === 1 ? "" : "s"} detected` : ""}
                {detected ? ` · signature: ${detected}` : ""}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.text,.csv,text/plain"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  void loadFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload /> Upload chat export (.txt)
              </Button>
            </div>
          </div>
          <div
            className="relative"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setDragging(true);
              }
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length) return;
              e.preventDefault();
              setDragging(false);
              void loadFile(e.dataTransfer.files[0]);
            }}
          >
            <Textarea
              id="raw"
              value={s.rawText}
              onChange={(e) => s.set({ rawText: e.target.value })}
              placeholder={"Paste the full message here, emojis and all. You can also drop a WhatsApp chat export (.txt) on this box.\n\n*HP ProBook 440 G11*\nCore Ultra 5 125U | 16GB | 512GB | 14\" | DOS\n@3000/-"}
              className={cn("min-h-90 font-mono text-sm", dragging && "border-primary ring-2 ring-primary/30")}
            />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-primary/5 text-sm font-medium text-primary">
                <FileText className="mr-2 size-4" /> Drop the file to load it
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Prices are optional. Lists without prices are still saved so you know who has the stock.
          </p>
          <Button onClick={submit} disabled={!canSubmit || pending}>
            <Sparkles />
            {pending ? "Queuing…" : "Read with AI"}
          </Button>
        </div>
      </CardContent>

      <Dialog open={!!chat} onOpenChange={(o) => !o && setChat(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Which message is the price list?</DialogTitle>
            <DialogDescription>
              {chat?.file}: {chat?.messages.length} messages. Messages with several prices are listed first.
            </DialogDescription>
          </DialogHeader>
          <ChatPicker messages={chat?.messages ?? []} onPick={pickMessage} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ChatPicker({ messages, onPick }: { messages: ChatMessage[]; onPick: (m: ChatMessage) => void }) {
  const likely = likelyPriceLists(messages);
  // no price-like message: offer the longest ones instead of an empty dialog
  const shown = (likely.length ? likely : [...messages].sort((a, b) => b.text.length - a.text.length)).slice(0, 30);
  return (
    <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
      {!likely.length && (
        <p className="text-sm text-muted-foreground">No message looks like a price list. The longest messages are shown.</p>
      )}
      {shown.map((m, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(m)}
          className="grid gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted/50"
        >
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">{m.sender}</span>
            <span className="text-xs text-muted-foreground">
              {m.at ? `${new Date(m.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${ago(new Date(m.at))}` : ""}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {m.text.split("\n").length} lines · {m.priceLines} with a price
          </div>
          <pre className="line-clamp-3 font-mono text-xs whitespace-pre-wrap">{m.text}</pre>
        </button>
      ))}
    </div>
  );
}
