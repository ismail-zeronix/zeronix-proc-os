"use client";

import { MousePointerClick, Monitor, Palette, Plus, Send, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { blockDef, docProductIds, newBlock } from "@/lib/newsletter/blocks";
import { hasUnsubToken, MAX_HTML } from "@/lib/newsletter/custom";
import { duplicateBlock, insertAfter, moveBlock, removeBlock, setField } from "@/lib/newsletter/doc-edit";
import { renderEmail } from "@/lib/newsletter/render";
import { HTML_KEY } from "@/lib/newsletter/templates";
import type { BlockType, NewsBrand, NewsDoc, ResolvedProduct } from "@/lib/newsletter/types";
import { resolveSiteProducts, saveCampaign, sendTestEmail, startNewsletter } from "./actions";
import { AiPrompt } from "./ai-prompt";
import { useRun } from "./audience-ui";
import { Field, ProductPicker, SectionPicker } from "./block-fields";
import { Canvas, type FieldEdit, type SectionAction } from "./canvas";
import { DesignPanel } from "./design-panel";
import { MailFrame } from "./mail-frame";

export interface EditorList {
  id: number;
  name: string;
  active: number;
  /** About how many days the list takes with the ready mailboxes (null = never, or no mailbox ready). */
  days: number | null;
}

export interface EditorInit {
  id: number | null;
  templateKey: string;
  name: string;
  subject: string;
  preheader: string;
  /** The block design (null for pasted code). */
  doc: NewsDoc | null;
  /** The pasted code (only for the HTML kind). */
  html: string;
  listId: number | null;
}

type Panel = "design" | "send" | "section" | null;

export function CampaignEditor({ init, lists, brand, logoSrc, userEmail, readyMailboxes }: { init: EditorInit; lists: EditorList[]; brand: NewsBrand; logoSrc: string; userEmail: string; readyMailboxes: number }) {
  const router = useRouter();
  const isHtml = init.templateKey === HTML_KEY;
  const [id, setId] = useState(init.id);
  const [panel, setPanel] = useState<Panel>(null);
  const [picking, setPicking] = useState<{ after: string | null } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const [name, setName] = useState(init.name);
  const [subject, setSubject] = useState(init.subject);
  const [preheader, setPreheader] = useState(init.preheader);
  const [doc, setDoc] = useState<NewsDoc | null>(init.doc);
  const [html, setHtml] = useState(init.html);
  const [listId, setListId] = useState<number | null>(init.listId);
  const [testTo, setTestTo] = useState(userEmail);
  const [products, setProducts] = useState<ResolvedProduct[]>([]);
  const [saving, runSave] = useRun<number>();
  const [testing, runTest] = useRun<string>();
  const [starting, runStart] = useRun<{ queued: number; skipped: number }>();

  const list = lists.find((l) => l.id === listId) ?? null;
  const idsKey = doc ? docProductIds(doc).join(",") : "";
  const block = doc?.blocks.find((b) => b.id === selected) ?? null;

  // product cards for the preview
  useEffect(() => {
    if (!idsKey) return;
    let live = true;
    void resolveSiteProducts(idsKey.split(",").map(Number)).then((p) => live && setProducts(p));
    return () => {
      live = false;
    };
  }, [idsKey]);

  const shownProducts = idsKey ? products : [];
  const htmlPreview = useMemo(
    () => (isHtml ? renderEmail({ html, subject, preheader, products: [], brand, logoSrc, firstName: "", unsubUrl: "#", reason: "" }).html : ""),
    [isHtml, html, subject, preheader, brand, logoSrc],
  );

  const payload = { name, templateKey: init.templateKey, subject, preheader, ...(isHtml ? { html } : { doc: doc ?? undefined }), listId };
  const empty = isHtml ? html.trim().length < 20 : !doc?.blocks.length;
  /** Saves the draft first, so a test or a start always sends what is on screen. */
  const save = (after: (id: number) => void, message = "Saved") =>
    runSave(
      () => saveCampaign(id, payload),
      message,
      (newId) => {
        setId(newId);
        after(newId);
      },
    );

  const onField = (m: FieldEdit) => setDoc((d) => (d ? setField(d, m) : d));
  const addBlock = (t: BlockType) => {
    if (!doc || !picking) return;
    const b = newBlock(t);
    setDoc(insertAfter(doc, picking.after, b));
    setSelected(b.id);
    setPicking(null);
  };
  const onAction = (bid: string, a: SectionAction) => {
    if (!doc) return;
    setSelected(bid);
    if (a === "up") setDoc(moveBlock(doc, bid, -1));
    else if (a === "down") setDoc(moveBlock(doc, bid, 1));
    else if (a === "del") {
      setDoc(removeBlock(doc, bid));
      setSelected(null);
    } else if (a === "dup") {
      const r = duplicateBlock(doc, bid);
      setDoc(r.doc);
      setSelected(r.id);
    } else if (a === "add") setPicking({ after: bid });
    else setPanel("section");
  };

  const sendPanel = (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="nf-list">Send to</Label>
        <NativeSelect className="w-full" id="nf-list" value={listId ?? ""} onChange={(e) => setListId(e.target.value ? Number(e.target.value) : null)}>
          <NativeSelectOption value="">Choose a list…</NativeSelectOption>
          {lists.map((l) => (
            <NativeSelectOption key={l.id} value={l.id}>
              {l.name} ({l.active})
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {list && (
          <p className="text-xs text-muted-foreground">
            {list.active} {list.active === 1 ? "person" : "people"} can receive it.
            {readyMailboxes === 0
              ? " No sending mailbox is ready yet (Prospecting › Settings)."
              : list.days === null
                ? ""
                : ` With ${readyMailboxes} mailbox${readyMailboxes === 1 ? "" : "es"} and today's limits it takes about ${list.days} day${list.days === 1 ? "" : "s"}, sent only in sending hours.`}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="nf-test">Send a test to</Label>
        <div className="flex gap-2">
          <Input id="nf-test" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button
            type="button"
            variant="outline"
            pending={saving || testing}
            disabled={!name.trim() || !subject.trim() || !testTo.trim() || empty}
            onClick={() => save((cid) => runTest(() => sendTestEmail(cid, testTo), (m) => `Test sent from ${m}`), "")}
          >
            Send test
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Open the test in Gmail and Outlook, on a phone too, before you start.</p>
      </div>

      <Button
        type="button"
        pending={saving || starting}
        disabled={!name.trim() || !subject.trim() || !listId || !list?.active || empty}
        onClick={() => {
          if (!confirm(`Start sending "${subject}" to ${list?.active ?? 0} people? Emails go out over the next days, inside sending hours. You can pause at any time, but not edit.`)) return;
          save((cid) => runStart(() => startNewsletter(cid), (r) => `Started: ${r.queued} queued${r.skipped ? `, ${r.skipped} skipped` : ""}`, () => router.replace(`/newsletter/campaigns/${cid}`)), "");
        }}
      >
        <Send /> Start sending
      </Button>
      <p className="text-xs text-muted-foreground">Name, subject and a list are needed. The newsletter cannot be edited after it starts.</p>
    </div>
  );

  return (
    <div className="grid gap-3">
      <section className="grid gap-3 rounded-xl border bg-card p-3 md:grid-cols-[1fr_1.4fr_1.4fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="nf-name" className="text-xs">
            Name (only you see it)
          </Label>
          <Input id="nf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CCTV offer, November" maxLength={100} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nf-subject" className="text-xs">
            Subject line
          </Label>
          <Input id="nf-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nf-pre" className="text-xs">
            Preview text (the grey line after the subject)
          </Label>
          <Input id="nf-pre" value={preheader} onChange={(e) => setPreheader(e.target.value)} maxLength={200} />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {!isHtml && (
          <Button type="button" variant="outline" size="sm" onClick={() => setPanel("design")}>
            <Palette /> Design
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" pending={saving} disabled={!name.trim() || !subject.trim()} onClick={() => save((cid) => id === null && router.replace(`/newsletter/campaigns/${cid}`))}>
          Save draft
        </Button>
        <Button type="button" size="sm" onClick={() => setPanel("send")}>
          <Send /> Send…
        </Button>
        {!isHtml && (
          <p className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
            <MousePointerClick className="size-3.5" /> Click any text to type. Click a section for its toolbar.
          </p>
        )}
        <div className="ml-auto flex gap-1">
          <Button type="button" variant={phone ? "outline" : "secondary"} size="icon-sm" aria-label="Desktop preview" title="Desktop" onClick={() => setPhone(false)}>
            <Monitor />
          </Button>
          <Button type="button" variant={phone ? "secondary" : "outline"} size="icon-sm" aria-label="Phone preview" title="Phone" onClick={() => setPhone(true)}>
            <Smartphone />
          </Button>
        </div>
      </div>

      {!isHtml && doc && (
        <div className="rounded-xl border bg-muted/40 p-3 sm:p-6">
          <Canvas
            doc={doc}
            products={shownProducts}
            brand={brand}
            logoSrc={logoSrc}
            selectedId={selected}
            phone={phone}
            subject={subject}
            preheader={preheader}
            onSelect={setSelected}
            onField={onField}
            onAction={onAction}
          />
          <div className="mx-auto mt-3 flex max-w-[640px] justify-center">
            <Button type="button" variant="outline" size="sm" onClick={() => setPicking({ after: null })}>
              <Plus /> Add section at the end
            </Button>
          </div>
        </div>
      )}

      {isHtml && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,32rem)_1fr]">
          <div className="grid min-w-0 gap-3">
            <AiPrompt brand={brand} defaultOpen={html.trim().length < 20} />
            <section className="grid gap-2 rounded-xl border bg-card p-3">
              <Label htmlFor="nf-html">Paste your HTML code</Label>
              <Textarea id="nf-html" rows={18} spellCheck={false} className="font-mono text-xs" value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<!doctype html> ... paste the full code from your email builder, designer or AI tool" />
              <p className={`text-xs ${html.length > MAX_HTML ? "text-destructive" : "text-muted-foreground"}`}>
                {html.length.toLocaleString()} of {MAX_HTML.toLocaleString()} characters.
              </p>
              <ul className="grid list-disc gap-1 pl-4 text-xs text-muted-foreground">
                <li>Pictures must be on a web address (https), not embedded in the code.</li>
                <li>
                  Scripts, forms and tracking code are removed. Use <code>{"{name}"}</code> for the reader&apos;s first name.
                </li>
                <li>
                  {hasUnsubToken(html)
                    ? "Your unsubscribe link is used. The company name and address are added at the bottom."
                    : "The company name, address and a working Unsubscribe link are added at the bottom. To place the link yourself, use {unsubscribe_url} as the link address."}
                </li>
              </ul>
            </section>
          </div>
          <div className="min-w-0 lg:sticky lg:top-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Preview (what readers see)</div>
            <MailFrame html={htmlPreview} title="Newsletter preview" height={1100} width={phone ? 390 : 640} />
          </div>
        </div>
      )}

      <SectionPicker open={!!picking} onOpenChange={(o) => !o && setPicking(null)} onPick={addBlock} />

      <Sheet open={panel === "design" && !!doc} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Design</SheetTitle>
            <SheetDescription>Colours and fonts for the whole newsletter.</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4">{doc && <DesignPanel style={doc.style} onChange={(style) => setDoc({ ...doc, style })} />}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={panel === "send"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Send</SheetTitle>
            <SheetDescription>Test it first, then start.</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4">{sendPanel}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={panel === "section" && !!block} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent side="right">
          {block && doc && (
            <>
              <SheetHeader>
                <SheetTitle>{blockDef(block.type).label} settings</SheetTitle>
                <SheetDescription>Text can also be typed straight onto the newsletter. Colours, links, pictures and lists are set here.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-3 overflow-y-auto px-4 pb-4">
                {blockDef(block.type).fields.map((f) => (
                  <Field
                    key={f.key}
                    id={`bf-${block.id}-${f.key}`}
                    spec={f}
                    value={block.p[f.key] ?? blockDef(block.type).defaults[f.key] ?? ""}
                    onChange={(v) => setDoc({ ...doc, blocks: doc.blocks.map((b) => (b.id === block.id ? { ...b, p: { ...b.p, [f.key]: v } } : b)) })}
                  />
                ))}
                {block.type === "products" && (
                  <ProductPicker ids={block.ids ?? []} products={shownProducts} onChange={(ids) => setDoc({ ...doc, blocks: doc.blocks.map((b) => (b.id === block.id ? { ...b, ids } : b)) })} />
                )}
                {!blockDef(block.type).fields.length && block.type !== "products" && <p className="text-xs text-muted-foreground">Nothing to set for this section.</p>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
