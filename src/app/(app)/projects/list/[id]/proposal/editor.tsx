"use client";

import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookCopy,
  CalendarRange,
  Check,
  CircleDollarSign,
  Copy,
  Download,
  Ellipsis,
  FilePlus2,
  FileText,
  GripVertical,
  Heading,
  ListTree,
  Loader2,
  Minus,
  PanelTop,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ScissorsLineDashed,
  Signature,
  Table2,
  TextQuote,
  Trash2,
  Type,
  WalletCards,
  Receipt,
  Landmark,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { CommandDialog, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type Block, blockLabel, BLOCK_TYPES, type BlockType, cloneBlock, headingNumbers, newBlock } from "@/lib/proposal";
import { createQuote, reviseQuote } from "../../../../sales/quote-actions";
import { applyTemplate, deleteProposalTemplate, saveAsTemplate, saveProposal } from "../../../proposal-actions";
import { BlockBody, type ProposalContext } from "./blocks";

const ICON: Record<BlockType, typeof Type> = {
  cover: PanelTop,
  heading: Heading,
  text: Type,
  table: Table2,
  pricing: CircleDollarSign,
  payment: WalletCards,
  timeline: CalendarRange,
  terms: TextQuote,
  signature: Signature,
  divider: Minus,
  page_break: ScissorsLineDashed,
  quote_header: Receipt,
  bank: Landmark,
};

type Status = "saved" | "dirty" | "saving" | "error" | "conflict";

interface Template {
  id: number;
  name: string;
  typeKey: string | null;
  createdBy: number | null;
  createdByName: string;
  blocks: number;
}

// ---------- outline ----------

function OutlineItem({ block, active, onPick }: { block: Block; active: boolean; onPick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const Icon = ICON[block.type];
  const indent = block.type === "heading" && block.data.level === 2;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1 rounded-md ${isDragging ? "z-10 bg-background shadow-md" : ""} ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      <button type="button" className="cursor-grab touch-none p-1 opacity-40 group-hover:opacity-100 active:cursor-grabbing" aria-label={`Drag to move ${blockLabel(block)}`} title="Drag to move" {...attributes} {...listeners}>
        <GripVertical className="size-3.5" />
      </button>
      <button type="button" onClick={onPick} className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1.5 text-left text-xs ${indent ? "pl-3" : ""} ${block.type === "heading" || block.type === "cover" ? "font-medium" : ""}`}>
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{blockLabel(block)}</span>
      </button>
    </li>
  );
}

function Outline({ blocks, activeId, onPick, onMove }: { blocks: Block[]; activeId: string | null; onPick: (id: string) => void; onMove: (from: number, to: number) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onMove(
      blocks.findIndex((b) => b.id === e.active.id),
      blocks.findIndex((b) => b.id === e.over!.id),
    );
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <ol className="grid gap-px">
          {blocks.map((b) => (
            <OutlineItem key={b.id} block={b} active={b.id === activeId} onPick={() => onPick(b.id)} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

// ---------- block frame on the paper ----------

function Frame({
  block,
  index,
  count,
  ctx,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onInsert,
  onSlash,
  num,
}: {
  block: Block;
  index: number;
  count: number;
  ctx: ProposalContext;
  onChange: (b: Block) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onInsert: (at: number) => void;
  onSlash: (id: string) => void;
  /** The number of a main heading ("3." Proposed Solution). */
  num?: number;
}) {
  const slash = useCallback(() => onSlash(block.id), [onSlash, block.id]);
  return (
    <section id={`block-${block.id}`} data-block-id={block.id} aria-label={blockLabel(block)} className={`group/block relative scroll-mt-24 ${block.type === "cover" ? "mb-4" : ""}`}>
      <div className="absolute top-0 -left-11 hidden flex-col items-center gap-0.5 opacity-0 transition-opacity group-focus-within/block:opacity-100 group-hover/block:opacity-100 md:flex print:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-neutral-500" aria-label={`Options for ${blockLabel(block)}`} title="Block options" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{BLOCK_TYPES.find((t) => t.key === block.type)?.label}</DropdownMenuLabel>
              {block.type === "heading" && (
                <DropdownMenuItem onClick={() => onChange({ ...block, data: { ...block.data, level: block.data.level === 1 ? 2 : 1 } })}>
                  <Heading /> {block.data.level === 1 ? "Make it a sub-heading" : "Make it a main heading"}
                </DropdownMenuItem>
              )}
              {block.type === "text" && (
                <DropdownMenuItem onClick={() => onChange({ ...block, data: { ...block.data, style: block.data.style === "callout" ? "plain" : "callout" } })}>
                  <TextQuote /> {block.data.style === "callout" ? "Plain text" : "Show as a highlighted note"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={index === 0} onClick={() => onMove(index, index - 1)}>
                <ArrowUp /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
                <ArrowDown /> Move down
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(index)}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onInsert(index + 1)}>
                <Plus /> Add a block below
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(index)}>
              <Trash2 /> Delete block
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <BlockBody block={block} onChange={onChange} ctx={ctx} onSlash={slash} num={num} />
    </section>
  );
}

/** The thin "+" line between blocks: adds a block at that place. */
function Gap({ at, onInsert }: { at: number; onInsert: (at: number) => void }) {
  return (
    <div className="group/gap relative flex h-5 items-center print:hidden">
      <button
        type="button"
        onClick={() => onInsert(at)}
        aria-label="Add a block here"
        title="Add a block here"
        className="mx-auto flex items-center gap-1 rounded-full border border-transparent bg-white px-2 text-[11px] text-neutral-400 opacity-0 transition-opacity group-hover/gap:border-neutral-200 group-hover/gap:opacity-100 focus-visible:opacity-100"
      >
        <Plus className="size-3" /> Add block
      </button>
      <span className="pointer-events-none absolute inset-x-0 top-1/2 -z-0 h-px bg-neutral-200 opacity-0 group-hover/gap:opacity-100" />
    </div>
  );
}

// ---------- the editor ----------

export function ProposalEditor({
  proposal,
  ctx,
  templates,
  typeLabel,
  dealId,
  quote,
  canOpenQuote,
}: {
  proposal: { id: number; title: string; blocks: Block[]; version: number; updatedAt: string; updatedBy: string };
  ctx: ProposalContext;
  templates: Template[];
  typeLabel: string;
  dealId: number;
  /** The quote in play: an open one is updated, an accepted one is final. */
  quote: { id: number; number: string; status: string } | null;
  /** The quote page (send, accept) is in Sales. */
  canOpenQuote: boolean;
}) {
  const [blocks, setBlocks] = useState<Block[]>(proposal.blocks);
  const [title, setTitle] = useState(proposal.title);
  const [status, setStatus] = useState<Status>("saved");
  const [savedAt, setSavedAt] = useState(proposal.updatedAt);
  const [conflict, setConflict] = useState<{ by: string; at: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(proposal.blocks[0]?.id ?? null);
  const [inserter, setInserter] = useState<{ at: number; replace?: string } | null>(null);
  const [saveTpl, setSaveTpl] = useState(false);
  const version = useRef(proposal.version);
  const latest = useRef({ title, blocks });
  const saving = useRef(false);
  const again = useRef(false);
  const dirty = useRef(false);
  const conflicted = useRef(false);

  // every edit goes through here: it marks the document as changed, which starts the autosave timer below
  const markDirty = useCallback(() => {
    if (conflicted.current) return;
    dirty.current = true;
    setStatus((s) => (s === "saving" ? s : "dirty"));
  }, []);
  const editBlocks = useCallback(
    (fn: (all: Block[]) => Block[]) => {
      setBlocks(fn);
      markDirty();
    },
    [markDirty],
  );
  const editTitle = (v: string) => {
    setTitle(v);
    markDirty();
  };

  // ---- autosave: a second after the last change; one save at a time; never over someone else's newer version ----
  const save = useCallback(async () => {
    if (saving.current) {
      // a save is on its way: save again when it is back
      again.current = true;
      return;
    }
    saving.current = true;
    try {
      do {
        again.current = false;
        if (!dirty.current || conflicted.current) break;
        dirty.current = false;
        setStatus("saving");
        try {
          const r = await saveProposal(proposal.id, version.current, latest.current);
          if (!r.ok) {
            conflicted.current = true;
            setConflict({ by: r.by, at: r.at });
            setStatus("conflict");
            return;
          }
          version.current = r.version;
          setSavedAt(r.savedAt);
          setStatus(dirty.current ? "dirty" : "saved");
        } catch (e) {
          dirty.current = true;
          setStatus("error");
          toast.error(`Not saved: ${(e as Error).message}`);
          return;
        }
      } while (again.current);
    } finally {
      saving.current = false;
    }
  }, [proposal.id]);

  useEffect(() => {
    latest.current = { title, blocks };
    if (!dirty.current) return;
    const t = setTimeout(() => void save(), 1000);
    return () => clearTimeout(t);
  }, [blocks, title, save]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") void save();
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || saving.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", warn);
    };
  }, [save]);

  // ---- which block is on screen (outline highlight) ----
  useEffect(() => {
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.blockId!;
          if (e.isIntersecting) seen.set(id, e.boundingClientRect.top);
          else seen.delete(id);
        }
        const top = [...seen.entries()].sort((a, b) => a[1] - b[1])[0];
        if (top) setActiveId(top[0]);
      },
      { rootMargin: "-80px 0px -55% 0px" },
    );
    document.querySelectorAll("[data-block-id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [blocks.length]);

  // ---- block operations ----
  const change = useCallback((b: Block) => editBlocks((all) => all.map((x) => (x.id === b.id ? b : x))), [editBlocks]);
  const move = useCallback((from: number, to: number) => editBlocks((all) => (to < 0 || to >= all.length ? all : arrayMove(all, from, to))), [editBlocks]);
  const duplicate = useCallback((i: number) => editBlocks((all) => [...all.slice(0, i + 1), cloneBlock(all[i]), ...all.slice(i + 1)]), [editBlocks]);
  const remove = useCallback(
    (i: number) => {
      const gone = latest.current.blocks[i];
      if (!gone) return;
      editBlocks((all) => all.filter((b) => b.id !== gone.id));
      toast(`Deleted "${blockLabel(gone)}"`, {
        action: { label: "Undo", onClick: () => editBlocks((now) => (now.some((b) => b.id === gone.id) ? now : [...now.slice(0, i), gone, ...now.slice(i)])) },
      });
    },
    [editBlocks],
  );
  const openInserter = useCallback((at: number) => setInserter({ at }), []);
  const slash = useCallback((id: string) => setInserter({ at: -1, replace: id }), []);
  const scrollTo = (id: string) => {
    document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };
  const insert = (type: BlockType) => {
    const b = newBlock(type);
    editBlocks((all) => {
      if (inserter?.replace) {
        const i = all.findIndex((x) => x.id === inserter.replace);
        // "/" in an empty text block turns that block into the chosen one
        return i < 0 ? [...all, b] : [...all.slice(0, i), b, ...all.slice(i + 1)];
      }
      const at = inserter?.at ?? all.length;
      return [...all.slice(0, at), b, ...all.slice(at)];
    });
    setInserter(null);
    setTimeout(() => {
      const el = document.getElementById(`block-${b.id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, textarea, [contenteditable=true]")?.focus();
    }, 80);
  };

  const startFrom = async (id: number | null, name: string) => {
    if (!confirm(`Replace the whole proposal with "${name}"? What is here now is replaced.`)) return;
    try {
      await save();
      const r = await applyTemplate(proposal.id, version.current, id);
      version.current = r.version;
      dirty.current = false;
      setBlocks(r.blocks);
      setStatus("saved");
      toast.success(`Started again from "${name}"`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // the customer gets the copy frozen with the quote, so save first, then make or update the quote
  const [quoting, setQuoting] = useState(false);
  const router = useRouter();
  const quoteNow = async () => {
    setQuoting(true);
    try {
      await save();
      if (dirty.current || conflicted.current) throw new Error("Save the proposal first.");
      const r = quote ? await reviseQuote(quote.id) : await createQuote(dealId);
      toast.success(quote ? `Quote ${r.number} updated with this proposal${"wasSent" in r && r.wasSent ? ". Send it to the customer again." : ""}` : `Quote ${r.number} made with this proposal`, {
        action: canOpenQuote ? { label: "Open the quote", onClick: () => router.push(`/sales/quotes/${r.id}`) } : { label: "Print", onClick: () => window.open(`/print/quote/${r.id}`, "_blank") },
      });
      // the button now updates this quote instead of making a new one
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setQuoting(false);
    }
  };

  const statusPill = {
    saved: { icon: <Check />, text: `Saved ${new Date(savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, cls: "text-muted-foreground" },
    dirty: { icon: <Save />, text: "Unsaved changes", cls: "text-muted-foreground" },
    saving: { icon: <Loader2 className="animate-spin" />, text: "Saving…", cls: "text-muted-foreground" },
    error: { icon: <AlertTriangle />, text: "Not saved, will retry", cls: "text-destructive" },
    conflict: { icon: <AlertTriangle />, text: "Not saved", cls: "text-destructive" },
  }[status];

  const outline = <Outline blocks={blocks} activeId={activeId} onPick={scrollTo} onMove={move} />;
  // headings are numbered as they print; the quotation header repeats the address typed on the cover
  const nums = headingNumbers(blocks);
  const coverBlock = blocks.find((b) => b.type === "cover");
  const address = coverBlock?.type === "cover" ? coverBlock.data.customerAddress : "";
  const liveCtx = useMemo(() => ({ ...ctx, customerAddress: address }), [ctx, address]);

  return (
    <div className="grid min-w-0 gap-3">
      {/* one compact bar: back, name, save state, templates */}
      <div className="sticky top-0 z-20 -mx-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:-mx-4 md:px-4">
        <BackButton fallback={`/projects/list/${ctx.projectId}`} />
        <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{ctx.projectNumber}</span>
        <Input aria-label="Proposal name (for the team)" className="h-8 max-w-80 min-w-40 flex-1 text-sm font-medium" value={title} onChange={(e) => editTitle(e.target.value)} />
        <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap [&_svg]:size-3.5 ${statusPill.cls}`} role="status" title={status === "saved" && proposal.updatedBy ? `Last saved by ${proposal.updatedBy}` : undefined}>
          {statusPill.icon} {statusPill.text}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="sm" className="lg:hidden" />}>
              <ListTree /> Outline
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-3">
              <SheetHeader className="p-0">
                <SheetTitle>Outline</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto">{outline}</div>
            </SheetContent>
          </Sheet>
          <Button variant="outline" size="sm" onClick={() => openInserter(blocks.length)}>
            <Plus /> Block
          </Button>
          <Button variant="outline" size="icon-sm" nativeButton={false} render={<a href={`/print/proposal/${proposal.id}`} target="_blank" rel="noreferrer" />} aria-label="Print preview" title="Print preview (working draft)">
            <Printer />
          </Button>
          <Button variant="outline" size="icon-sm" nativeButton={false} render={<a href={`/api/projects/proposals/${proposal.id}/pdf`} />} aria-label="Download the draft as PDF" title="Download the draft as PDF">
            <Download />
          </Button>
          {quote?.status === "accepted" ? (
            <span className="text-xs whitespace-nowrap text-muted-foreground" title="The customer accepted this quote; its proposal is final">
              {quote.number} accepted
            </span>
          ) : (
            <Button
              size="sm"
              pending={quoting}
              onClick={quoteNow}
              title={quote ? `Freeze this proposal and the BOQ into ${quote.number} (keeps its number)` : "Make a numbered quote (ZQ) from the BOQ with this proposal as its document"}
            >
              {quote ? <RefreshCw /> : <FilePlus2 />} {quote ? `Update ${quote.number}` : "Make quote"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <BookCopy /> Templates
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Start again from</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => startFrom(null, "Standard proposal")}>
                  <FileText /> Standard proposal
                </DropdownMenuItem>
                {templates.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => startFrom(t.id, t.name)}>
                    <FileText />
                    <span className="min-w-0 flex-1 truncate">
                      {t.name}
                      <span className="ml-1 text-xs text-muted-foreground">{t.typeKey ? typeLabel : "all types"}</span>
                    </span>
                    {(t.createdBy === ctx.meId || ctx.isAdmin) && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Remove the template ${t.name}`}
                        title="Remove this template"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove the template "${t.name}"?`)) deleteProposalTemplate(t.id).then(() => toast.success("Template removed"), (err: Error) => toast.error(err.message));
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSaveTpl(true)}>
                <Save /> Save this proposal as a template…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {conflict && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm" role="alert">
          <AlertTriangle className="size-4 text-destructive" />
          <span className="min-w-0 flex-1">
            {conflict.by} changed this proposal at {conflict.at ? new Date(conflict.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "the same time"}, so your latest changes were not saved. Copy anything you need, then reload to see their version.
          </span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Outline" className="sticky top-16 hidden max-h-[calc(100svh-6rem)] overflow-y-auto rounded-xl border bg-card p-2 lg:block">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">Outline · {blocks.length}</span>
          </div>
          {outline}
        </nav>

        <div className="min-w-0 overflow-x-auto pb-16">
          <article className="mx-auto w-full max-w-[794px] rounded-sm bg-white px-5 py-8 text-neutral-900 shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.06)] sm:px-14 sm:py-12" aria-label="Proposal">
            <Gap at={0} onInsert={openInserter} />
            {blocks.map((b, i) => (
              <div key={b.id}>
                <Frame block={b} index={i} count={blocks.length} ctx={liveCtx} onChange={change} onMove={move} onDuplicate={duplicate} onDelete={remove} onInsert={openInserter} onSlash={slash} num={nums.get(b.id)} />
                <Gap at={i + 1} onInsert={openInserter} />
              </div>
            ))}
            {!blocks.length && (
              <button type="button" onClick={() => openInserter(0)} className="w-full rounded-lg border border-dashed border-neutral-300 py-10 text-sm text-neutral-500 hover:bg-neutral-50">
                Empty proposal. Click to add the first block, or start from a template.
              </button>
            )}
          </article>
        </div>
      </div>

      <CommandDialog open={!!inserter} onOpenChange={(o) => !o && setInserter(null)} title="Add a block" description="Pick the kind of block to add">
        <Command>
          <CommandInput placeholder="Add a block…" />
          <CommandList>
            <CommandEmpty>No block like that.</CommandEmpty>
            <CommandGroup heading="Blocks">
              {BLOCK_TYPES.map((t) => {
                const Icon = ICON[t.key];
                return (
                  <CommandItem key={t.key} value={`${t.label} ${t.hint}`} onSelect={() => insert(t.key)}>
                    <Icon />
                    <span className="font-medium whitespace-nowrap">{t.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{t.hint}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      <SaveTemplateDialog open={saveTpl} onOpenChange={setSaveTpl} typeLabel={typeLabel} onSave={async (name, forType) => {
        await save();
        await saveAsTemplate(proposal.id, name, forType);
        toast.success(`Saved as the template "${name}"`);
      }} />
    </div>
  );
}

function SaveTemplateDialog({ open, onOpenChange, typeLabel, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; typeLabel: string; onSave: (name: string, forType: boolean) => Promise<void> }) {
  const [name, setName] = useState("");
  const [forType, setForType] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as a template</DialogTitle>
          <DialogDescription>New proposals can start from it. Prices are not saved: the price block always shows the project&apos;s own BOQ.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onSave(name, forType);
              setName("");
              onOpenChange(false);
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input autoFocus aria-label="Template name" placeholder={`e.g. ${typeLabel} for villas`} value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={forType} onChange={(e) => setForType(e.target.checked)} /> Only offer it for {typeLabel} projects
          </label>
          <div className="flex gap-2">
            <Button type="submit" pending={busy} disabled={name.trim().length < 2}>
              Save template
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
