"use client";

import { CalendarClock, CircleAlert, CircleCheck, EyeOff, History, Rocket, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ago } from "@/lib/format";
import type { PostInput } from "@/lib/website/post-parse";
import type { SiteCheck } from "@/lib/website/types";
import { FaqRows, Field, ImagesField, LinesInput, Panel, Rows, useLocal } from "../../catalog-ui";
import { previewPostAction, restoreRevisionAction, savePostAction, setPostStatusAction } from "../../content-actions";

interface Props {
  id: number;
  initial: PostInput;
  status: string;
  publishAt: string | null;
  checks: SiteCheck[];
  revisions: { id: number; note: string; by: string; at: string }[];
  industries: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  products: { id: number; name: string; status: string }[];
  authors: { id: number; name: string; jobTitle: string }[];
  isAdmin: boolean;
}

const ICON = { ok: CircleCheck, warn: TriangleAlert, fail: CircleAlert };
const TONE = { ok: "text-emerald-600", warn: "text-amber-600", fail: "text-destructive" };

/** Counter that turns amber outside the range search engines show. */
function Count({ n, min, max }: { n: number; min: number; max: number }) {
  return <span className={`text-xs tabular-nums ${n < min || n > max ? "text-amber-700" : "text-muted-foreground"}`}>{n}</span>;
}

export function PostEditor({ id, initial, status, publishAt, checks, revisions, industries, categories, products, authors, isAdmin }: Props) {
  const router = useRouter();
  const [f, patch] = useLocal<PostInput>(initial);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [when, setWhen] = useState(publishAt ? publishAt.slice(0, 16) : "");
  const [pending, start] = useTransition();
  const edit = (p: Partial<PostInput>) => {
    patch(p);
    setDirty(true);
  };

  const save = async () => {
    const res = await savePostAction({ ...f, keywords: f.keywords.filter(Boolean), tags: f.tags.filter(Boolean) }, id);
    if (res.error !== undefined) {
      toast.error(res.error);
      return false;
    }
    setDirty(false);
    return true;
  };
  const run = (fn: () => Promise<boolean | void>, ok: string) =>
    start(async () => {
      if ((await fn()) === false) return;
      toast.success(ok);
      router.refresh();
    });
  const status_ = (kind: "publish" | "schedule" | "unpublish" | "archive", ok: string, at?: string) =>
    run(async () => {
      if (dirty && !(await save())) return false;
      const res = await setPostStatusAction(id, kind, at);
      if (res.error !== undefined) {
        toast.error(res.error);
        return false;
      }
    }, ok);

  const failing = checks.filter((c) => c.level === "fail").length;

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_24rem]">
      <div className="grid content-start gap-3">
        <Panel title="Post">
          <Field id="title" label="Title (the page's H1)">
            <Input id="title" value={f.title} onChange={(e) => edit({ title: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
            <Field id="type" label="Type">
              <NativeSelect id="type" value={f.type} onChange={(e) => edit({ type: e.target.value as PostInput["type"] })}>
                <NativeSelectOption value="guide">Buying guide (/guides)</NativeSelectOption>
                <NativeSelectOption value="comparison">Comparison (/guides)</NativeSelectOption>
                <NativeSelectOption value="article">Blog post (/blog)</NativeSelectOption>
                <NativeSelectOption value="industry_page">Industry page (/guides)</NativeSelectOption>
                <NativeSelectOption value="page">Company page (/about, /privacy...)</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field id="slug" label="Web address">
              <Input id="slug" value={f.slug} onChange={(e) => edit({ slug: e.target.value })} />
            </Field>
          </div>
          <Field id="excerpt" label="Excerpt" hint="Shown on cards and under the title">
            <Textarea id="excerpt" rows={2} value={f.excerpt} onChange={(e) => edit({ excerpt: e.target.value })} />
          </Field>
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Text (Markdown)</span>
              <span className="text-xs text-muted-foreground">
                Shortcodes on their own line: {"{{product:slug}}"} · {"{{compare}}"} · {"{{cta}}"}
              </span>
              <div className="ml-auto flex gap-1">
                <Button type="button" size="sm" variant={preview === null ? "secondary" : "ghost"} onClick={() => setPreview(null)}>
                  Write
                </Button>
                <Button type="button" size="sm" variant={preview !== null ? "secondary" : "ghost"} onClick={() => start(async () => setPreview(await previewPostAction(f.body)))}>
                  Preview
                </Button>
              </div>
            </div>
            {preview === null ? (
              <Textarea aria-label="Text" rows={28} className="font-mono text-xs leading-relaxed" value={f.body} onChange={(e) => edit({ body: e.target.value })} />
            ) : (
              <div className="prose prose-sm max-h-[48rem] max-w-none overflow-auto rounded-md border bg-background p-4 dark:prose-invert [&_.shortcode]:rounded [&_.shortcode]:bg-muted [&_.shortcode]:px-2 [&_.shortcode]:font-mono [&_.shortcode]:text-xs" dangerouslySetInnerHTML={{ __html: preview }} />
            )}
          </div>
        </Panel>

        {f.type !== "article" && (
          <Panel title="Picks" hint="Ranked models from the catalog: shown as cards and a comparison table">
            <Rows
              items={f.products}
              onChange={(products) => edit({ products: products.map((p, i) => ({ ...p, rank: i + 1 })) })}
              blank={{ productId: products[0]?.id ?? 0, rank: 0, label: "", verdict: "", pros: [], cons: [] }}
              addLabel="Add a pick"
              render={(p, set, i) => (
                <div className="grid gap-1.5 rounded-md border p-2">
                  <div className="grid gap-1.5 sm:grid-cols-[1fr_12rem]">
                    <NativeSelect aria-label={`Pick ${i + 1}`} value={p.productId} onChange={(e) => set({ ...p, productId: Number(e.target.value) })}>
                      {products.map((x) => (
                        <NativeSelectOption key={x.id} value={x.id}>
                          {x.name}
                          {x.status !== "published" ? " (not published)" : ""}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <Input aria-label={`Pick ${i + 1} label`} placeholder="Best overall" value={p.label} onChange={(e) => set({ ...p, label: e.target.value })} />
                  </div>
                  <Textarea aria-label={`Pick ${i + 1} verdict`} rows={2} placeholder="Why it is on the list" value={p.verdict} onChange={(e) => set({ ...p, verdict: e.target.value })} />
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <LinesInput id={`pros-${i}`} rows={2} placeholder="Pros, one per line" value={p.pros} onChange={(pros) => set({ ...p, pros })} />
                    <LinesInput id={`cons-${i}`} rows={2} placeholder="Cons, one per line" value={p.cons} onChange={(cons) => set({ ...p, cons })} />
                  </div>
                </div>
              )}
            />
          </Panel>
        )}

        <Panel title="Questions and answers">
          <FaqRows value={f.faq} onChange={(faq) => edit({ faq })} />
        </Panel>
      </div>

      <div className="grid content-start gap-3">
        <Panel title="Publish" hint={dirty ? "Unsaved changes" : undefined}>
          <Button pending={pending} variant="outline" onClick={() => run(save, "Saved")}>
            Save
          </Button>
          {status !== "published" ? (
            <Button pending={pending} onClick={() => status_("publish", "Published: live on the site")} title={failing ? `${failing} checklist item(s) failing` : undefined}>
              <Rocket /> Publish now{failing ? ` (${failing} failing)` : ""}
            </Button>
          ) : (
            <Button pending={pending} variant="outline" onClick={() => status_("unpublish", "Taken off the site; back to draft")}>
              <EyeOff /> Unpublish
            </Button>
          )}
          {status !== "published" && (
            <div className="flex gap-2">
              <Input type="datetime-local" aria-label="Publish at" value={when} onChange={(e) => setWhen(e.target.value)} />
              <Button pending={pending} variant="outline" disabled={!when} onClick={() => status_("schedule", "Scheduled", new Date(when).toISOString())}>
                <CalendarClock /> Schedule
              </Button>
            </div>
          )}
          {status === "scheduled" && publishAt && <p className="text-xs text-muted-foreground">Goes live {new Date(publishAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</p>}
          {status !== "archived" && (
            <Button size="sm" variant="ghost" className="w-fit text-muted-foreground" pending={pending} onClick={() => status_("archive", "Archived")}>
              Archive
            </Button>
          )}
        </Panel>

        <Panel title="Checklist" hint={dirty ? "Save to update" : `${checks.filter((c) => c.level === "ok").length}/${checks.length} pass`}>
          <ul className="grid gap-2">
            {checks.map((c) => {
              const Icon = ICON[c.level];
              return (
                <li key={c.key} className="flex gap-2 text-sm">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${TONE[c.level]}`} />
                  <span>
                    <span className="font-medium">{c.label}</span>
                    {c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Search engines">
          <Field id="mt" label="Meta title">
            <Input id="mt" value={f.metaTitle} placeholder={f.title} onChange={(e) => edit({ metaTitle: e.target.value })} />
            <Count n={(f.metaTitle || f.title).length} min={20} max={60} />
          </Field>
          <Field id="md" label="Meta description">
            <Textarea id="md" rows={3} value={f.metaDescription} onChange={(e) => edit({ metaDescription: e.target.value })} />
            <Count n={f.metaDescription.length} min={120} max={160} />
          </Field>
          <Field id="pk" label="Primary keyword">
            <Input id="pk" value={f.primaryKeyword} onChange={(e) => edit({ primaryKeyword: e.target.value })} />
          </Field>
          <Field id="kw" label="Other keywords" hint="One per line">
            <LinesInput id="kw" rows={3} value={f.keywords} onChange={(keywords) => edit({ keywords })} />
          </Field>
        </Panel>

        <Panel title="Byline and topic">
          <Field id="author" label="Author" hint={isAdmin ? "Shown on the post and its author page" : "Only an admin can change the author"}>
            <NativeSelect id="author" disabled={!isAdmin} value={f.authorUserId ?? ""} onChange={(e) => edit({ authorUserId: e.target.value ? Number(e.target.value) : null })}>
              {authors.map((a) => (
                <NativeSelectOption key={a.id} value={a.id}>
                  {a.name}
                  {a.jobTitle ? ` · ${a.jobTitle}` : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="industry" label="Industry">
            <NativeSelect id="industry" value={f.industryId ?? ""} onChange={(e) => edit({ industryId: e.target.value ? Number(e.target.value) : null })}>
              <NativeSelectOption value="">None</NativeSelectOption>
              {industries.map((i) => (
                <NativeSelectOption key={i.id} value={i.id}>
                  {i.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="pcat" label="Product category">
            <NativeSelect id="pcat" value={f.categoryId ?? ""} onChange={(e) => edit({ categoryId: e.target.value ? Number(e.target.value) : null })}>
              <NativeSelectOption value="">None</NativeSelectOption>
              {categories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="cat" label="Blog category" hint="e.g. Buying advice, Security, News">
            <Input id="cat" value={f.category} onChange={(e) => edit({ category: e.target.value })} />
          </Field>
          <Field id="cta" label="Call-to-action text" hint="Empty = the site's default">
            <Input id="cta" value={f.ctaText} onChange={(e) => edit({ ctaText: e.target.value })} />
          </Field>
        </Panel>

        <Panel title="Cover picture" hint="16:9, also used when shared">
          <ImagesField value={f.cover ? [f.cover] : []} onChange={(v) => edit({ cover: v[0] ?? null })} altDefault={f.title} />
        </Panel>

        <Panel title="Review notes" hint="Only in the portal">
          <Textarea rows={3} value={f.reviewNotes} onChange={(e) => edit({ reviewNotes: e.target.value })} />
        </Panel>

        <Panel title="Versions">
          <ul className="grid gap-1.5">
            {revisions.map((r, i) => (
              <li key={r.id} className="flex items-center gap-2 text-xs">
                <History className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {r.note} · {r.by} · {ago(new Date(r.at))}
                </span>
                {i > 0 && (
                  <Button
                    size="xs"
                    variant="ghost"
                    pending={pending}
                    onClick={() =>
                      confirm("Go back to this version? The current text is kept as a version too.") &&
                      run(async () => {
                        const res = await restoreRevisionAction(id, r.id);
                        if (res.error !== undefined) {
                          toast.error(res.error);
                          return false;
                        }
                        window.location.reload();
                      }, "Restored")
                    }
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
