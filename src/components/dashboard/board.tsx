"use client";

import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, LayoutDashboard, Plus, RotateCcw, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { saveDashboardLayout } from "@/app/(app)/accounts/dashboard-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { defaultLayout, WIDGET_GROUPS, widgetDef, widgetsFor, type WidgetPlacement, type WidgetWidth } from "@/lib/dashboard-widgets";
import { errorText } from "@/lib/user-error";

/** Grid classes per width: 2 columns on a phone (key figures side by side), 6 on a tablet, 12 on a desktop. */
const SPAN: Record<WidgetWidth, string> = {
  3: "md:col-span-2 lg:col-span-3",
  4: "md:col-span-3 lg:col-span-4",
  6: "md:col-span-3 lg:col-span-6",
  8: "md:col-span-6 lg:col-span-8",
  12: "md:col-span-6 lg:col-span-12",
};
const spanOf = (p: WidgetPlacement) => `${widgetDef(p.id)?.group === "Key figures" ? "col-span-1" : "col-span-2"} ${SPAN[p.w]}`;
const WIDTH_LABEL: Record<WidgetWidth, string> = { 3: "¼", 4: "⅓", 6: "½", 8: "⅔", 12: "Full" };
const WIDTH_NAME: Record<WidgetWidth, string> = { 3: "a quarter", 4: "a third", 6: "half", 8: "two thirds", 12: "the full" };
const GRID = "grid grid-cols-2 gap-3 md:grid-cols-6 lg:grid-cols-12";

/** One widget while arranging: a handle to drag, its width, and a way to take it off. What it shows stays visible but asleep. */
function EditTile({ place, slot, onWidth, onRemove }: { place: WidgetPlacement; slot: ReactNode; onWidth: (w: WidgetWidth) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id });
  const def = widgetDef(place.id)!;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={`${spanOf(place)} flex min-w-0 flex-col overflow-hidden rounded-xl border-2 border-dashed border-primary/40 bg-background ${isDragging ? "z-30 opacity-80 shadow-lg" : ""}`}>
      <div className="flex min-h-9 items-center gap-1 border-b bg-muted/50 px-1">
        <button type="button" {...attributes} {...listeners} aria-label={`Move ${def.title}`} title="Drag to move" className="shrink-0 cursor-grab touch-none rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing">
          <GripVertical className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{def.title}</span>
        <span className="hidden items-center md:inline-flex" role="group" aria-label={`Width of ${def.title}`}>
          {[...def.widths]
            .sort((a, b) => a - b)
            .map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={place.w === w}
                title={`Take up ${WIDTH_NAME[w]} width`}
                onClick={() => onWidth(w)}
                className={`h-6 min-w-6 rounded px-1 text-xs ${place.w === w ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {WIDTH_LABEL[w]}
              </button>
            ))}
        </span>
        <button type="button" onClick={onRemove} aria-label={`Remove ${def.title}`} title="Remove" className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="pointer-events-none min-h-20 flex-1 select-none opacity-70" aria-hidden>
        {slot ?? (
          <div className="grid h-full content-center p-4 text-center">
            <p className="text-sm font-medium">{def.title}</p>
            <p className="text-xs text-muted-foreground">Its figures appear when you press Done.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddDialog({ layout, accountant, onAdd }: { layout: WidgetPlacement[]; accountant: boolean; onAdd: (id: string) => void }) {
  const on = new Set(layout.map((p) => p.id));
  const all = widgetsFor(accountant);
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus /> Add widget
          </Button>
        }
      />
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a widget</DialogTitle>
          <DialogDescription>Pick what you want to see. New ones go to the end: drag them where you like.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {WIDGET_GROUPS.map((g) => (
            <section key={g} className="grid gap-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground">{g}</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {all
                  .filter((w) => w.group === g)
                  .map((w) => (
                    <li key={w.id} className="flex items-center gap-2 rounded-lg border p-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{w.title}</div>
                        <div className="text-xs text-muted-foreground">{w.hint}</div>
                      </div>
                      {on.has(w.id) ? (
                        <span className="flex shrink-0 items-center gap-1 px-1 text-xs text-muted-foreground">
                          <Check className="size-3.5" /> Added
                        </span>
                      ) : (
                        <Button size="xs" variant="outline" className="shrink-0" onClick={() => onAdd(w.id)} aria-label={`Add ${w.title}`}>
                          <Plus /> Add
                        </Button>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The overview: widgets on a grid. Customize turns it into an arranging mode: drag to move, pick a width, remove, or add
 * from the list of ready-made widgets. Done saves it for this person; Cancel leaves it as it was.
 */
export function DashboardBoard({ initial, slots, accountant, toolbar }: { initial: WidgetPlacement[]; slots: Record<string, ReactNode>; accountant: boolean; toolbar: ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [pending, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const layout = editing ? draft : initial;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = draft.map((p) => p.id);
    setDraft(arrayMove(draft, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  const save = () =>
    start(async () => {
      try {
        await saveDashboardLayout(draft);
        toast.success("Your overview is saved");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Overview</h1>
        {editing ? (
          <>
            <span className="text-xs text-muted-foreground">Drag to move, pick a width, or remove what you do not need.</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <AddDialog layout={draft} accountant={accountant} onAdd={(id) => setDraft([...draft, { id, w: widgetDef(id)!.widths[0] }])} />
              <Button variant="ghost" size="sm" title="Back to the usual layout" onClick={() => setDraft(defaultLayout())}>
                <RotateCcw /> Reset
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </Button>
              <Button size="sm" pending={pending} onClick={save}>
                <Save /> Done
              </Button>
            </div>
          </>
        ) : (
          <>
            {toolbar}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setDraft(initial);
                setEditing(true);
              }}
            >
              <LayoutDashboard /> Customize
            </Button>
          </>
        )}
      </div>

      {editing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={draft.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className={GRID}>
              {draft.map((p) => (
                <EditTile
                  key={p.id}
                  place={p}
                  slot={slots[p.id]}
                  onWidth={(w) => setDraft(draft.map((x) => (x.id === p.id ? { ...x, w } : x)))}
                  onRemove={() => setDraft(draft.filter((x) => x.id !== p.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : layout.length ? (
        <div className={GRID}>
          {layout.map((p) => (
            <div key={p.id} className={`${spanOf(p)} min-w-0`}>
              {slots[p.id]}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-xl border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Nothing on your overview yet.</p>
          <Button
            size="sm"
            onClick={() => {
              setDraft(initial);
              setEditing(true);
            }}
          >
            <LayoutDashboard /> Customize
          </Button>
        </div>
      )}
    </div>
  );
}
