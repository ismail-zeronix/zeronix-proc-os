import { Code2, PenLine } from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { PageToolbar } from "@/components/page-toolbar";
import { requireApp } from "@/lib/auth/session";
import { withTheme } from "@/lib/newsletter/blocks";
import { BLANK_KEY, blankDoc, HTML_KEY, templateByKey, TEMPLATES } from "@/lib/newsletter/templates";
import { CampaignEditor } from "../../campaign-editor";
import { editorContext } from "../../editor-data";

export const metadata = { title: "New newsletter · Zeronix Newsletter" };

export default async function NewCampaignPage({ searchParams }: PageProps<"/newsletter/campaigns/new">) {
  const { user } = await requireApp("newsletter");
  const sp = await searchParams;
  const key = typeof sp.template === "string" ? sp.template : "";
  const theme = typeof sp.theme === "string" ? sp.theme : "";
  const template = templateByKey(key);
  const isHtml = key === HTML_KEY;
  const isBlank = key === BLANK_KEY;
  if (!template && !isHtml && !isBlank) {
    // nothing chosen yet: pick how to start
    return (
      <div className="grid gap-3">
        <PageToolbar title="New newsletter" meta="Pick how to start. Everything can be changed afterwards.">
          <BackButton fallback="/newsletter" />
        </PageToolbar>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={`/newsletter/campaigns/new?template=${BLANK_KEY}`} className="flex items-start gap-3 rounded-xl border bg-card p-3 hover:bg-muted/50">
            <PenLine className="mt-0.5 size-5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Blank design</span>
              <span className="block text-xs text-muted-foreground">Build your own from sections: banner, text, pictures, buttons, products.</span>
            </span>
          </Link>
          <Link href={`/newsletter/campaigns/new?template=${HTML_KEY}`} className="flex items-start gap-3 rounded-xl border bg-card p-3 hover:bg-muted/50">
            <Code2 className="mt-0.5 size-5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold">Paste HTML code</span>
              <span className="block text-xs text-muted-foreground">Designed elsewhere (an email builder, a designer, an AI tool)? Paste the code. We add the legal footer and Unsubscribe link.</span>
            </span>
          </Link>
        </div>
        <div className="text-xs font-medium text-muted-foreground">Or start from a ready-made design</div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {TEMPLATES.map((t) => (
            <Link key={t.key} href={`/newsletter/campaigns/new?template=${t.key}`} className="rounded-xl border bg-card p-3 hover:bg-muted/50">
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-xs text-muted-foreground">{t.blurb}</div>
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Want to see them first? <Link href="/newsletter/templates" className="underline">Open the template gallery</Link>.
        </p>
      </div>
    );
  }
  const ctx = await editorContext();
  const title = template ? template.name : isHtml ? "Pasted HTML code" : "Blank design";
  return (
    <div className="grid gap-3">
      <PageToolbar title={`New newsletter · ${title}`} meta={isHtml ? "Paste, preview, test, then start" : "Edit, preview, test, then start"}>
        <BackButton fallback="/newsletter/campaigns/new" />
      </PageToolbar>
      <CampaignEditor
        init={{
          id: null,
          templateKey: template ? template.key : key,
          name: "",
          subject: template?.subject ?? "",
          preheader: template?.preheader ?? "",
          doc: isHtml ? null : withTheme(template?.doc ?? blankDoc(), theme),
          html: "",
          listId: null,
        }}
        lists={ctx.lists}
        brand={ctx.brand}
        logoSrc={ctx.logoSrc}
        userEmail={user.email}
        readyMailboxes={ctx.readyMailboxes}
      />
    </div>
  );
}
