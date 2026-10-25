"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, FolderKanban, Loader2, Package, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AvatarPicker } from "@/components/avatar-picker";
import { useGoBack } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { EMIRATES, INDUSTRIES, SOURCES, stageLabel } from "@/lib/sales";
import { createDeal } from "../actions";

interface Co {
  id: number;
  name: string;
  emirate: string;
  industry: string;
}
interface Person {
  id: number;
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
}

/**
 * One compact form for a new deal: company, person and the request side by side.
 * Used as a page (opens the new deal afterwards) and inside the "+" dialog on a board column (stays on the board).
 */
export function DealForm({
  users,
  meId,
  preset,
  stage = "new",
  onCreated,
  afterHref,
  projectTypes = [],
  kind: initialKind = "product",
}: {
  users: { id: number; name: string }[];
  meId: number;
  preset: { id: number; name: string } | null;
  stage?: string;
  onCreated?: (dealId: number) => void;
  /** Where to go once the deal exists (the quote builder opens on it); default: stay, or open the deal. */
  afterHref?: (dealId: number) => string;
  /** Types offered when the deal is a project (empty = the Product / Project choice is hidden). */
  projectTypes?: { key: string; label: string }[];
  kind?: "product" | "project";
}) {
  const router = useRouter();
  const goBack = useGoBack("/crm/deals");
  const [pending, start] = useTransition();
  const [company, setCompany] = useState<Co | null>(preset ? { ...preset, emirate: "", industry: "" } : null);
  const [typed, setTyped] = useState("");
  const [debounced, setDebounced] = useState("");
  const [contactId, setContactId] = useState<number | "new">("new");
  const [team, setTeam] = useState<number[]>([meId]);
  const [kind, setKind] = useState<"product" | "project">(projectTypes.length ? initialKind : "product");
  const [projectType, setProjectType] = useState("");
  const [f, setF] = useState({
    emirate: "",
    industry: "",
    contactName: "",
    contactJobTitle: "",
    contactEmail: "",
    contactPhone: "",
    source: "",
    requirement: "",
    value: "",
    title: "",
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(typed.trim()), 200);
    return () => clearTimeout(t);
  }, [typed]);

  const found = useQuery<{ companies: Co[] }>({
    queryKey: ["sales-company-search", debounced],
    queryFn: () => fetch(`/api/sales/search?kind=company&q=${encodeURIComponent(debounced)}`).then((r) => r.json()),
    enabled: !company && debounced.length >= 2,
    staleTime: 10_000,
  });
  const people = useQuery<{ contacts: Person[] }>({
    queryKey: ["sales-company-contacts", company?.id],
    queryFn: () => fetch(`/api/sales/contacts?companyId=${company!.id}`).then((r) => r.json()),
    enabled: !!company,
    staleTime: 10_000,
  });
  const existing = people.data?.contacts ?? [];
  const exact = found.data?.companies.find((c) => c.name.toLowerCase() === typed.trim().toLowerCase());

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  // what still stops the deal from being saved, said in words next to the button instead of a silently greyed-out button
  const missing =
    !company && typed.trim().length < 2
      ? "Pick a company or type its name."
      : !f.requirement.trim() && !f.contactName.trim() && contactId === "new"
        ? "Write what they want, or add a contact person."
        : kind === "project" && !projectType
          ? "Pick the project type."
          : "";

  const save = () =>
    start(async () => {
      try {
        const value = f.value.trim() ? Number(f.value.replace(/,/g, "")) : null;
        if (value !== null && !Number.isFinite(value)) throw new Error("The value must be a number.");
        const res = await createDeal({
          companyId: company?.id,
          companyName: company ? "" : typed.trim(),
          emirate: f.emirate,
          industry: f.industry,
          contactId: contactId === "new" ? undefined : contactId,
          contactName: contactId === "new" ? f.contactName : "",
          contactJobTitle: f.contactJobTitle,
          contactEmail: f.contactEmail,
          contactPhone: f.contactPhone,
          title: f.title,
          source: f.source,
          requirement: f.requirement,
          valueAed: value,
          ownerIds: team.length ? team : [meId],
          stage,
          kind,
          projectType: kind === "project" ? projectType : "",
        });
        toast.success(res.reusedCompany ? `Added to the existing company "${res.reusedCompany}"` : "Deal added", {
          action: onCreated && !afterHref ? { label: "Open deal", onClick: () => router.push(`/crm/deals/${res.id}`) } : undefined,
        });
        onCreated?.(res.id);
        if (afterHref) router.replace(afterHref(res.id));
        else if (!onCreated) router.replace(`/crm/deals/${res.id}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  const heading = "text-xs font-medium tracking-wide text-muted-foreground uppercase";
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (missing) toast.error(missing);
        else save();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <section className="grid content-start gap-2">
          <h3 className={heading}>Company</h3>
          {company ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-1.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Check className="size-4 text-emerald-600" /> {company.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Choose another company"
                onClick={() => {
                  setCompany(null);
                  setContactId("new");
                }}
              >
                <X />
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search or type a new company" className="pl-8" aria-label="Company name" />
                {found.isFetching && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
              {found.data?.companies.length ? (
                <div className="grid gap-0.5 rounded-lg border p-1">
                  {found.data.companies.map((c) => (
                    <button key={c.id} type="button" className="flex items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => setCompany(c)}>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{[c.emirate, c.industry].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {typed.trim().length >= 2 && !exact && (
                <div className="grid grid-cols-2 gap-2">
                  <NativeSelect className="w-full" aria-label="Emirate" value={f.emirate} onChange={set("emirate")}>
                    <NativeSelectOption value="">Emirate</NativeSelectOption>
                    {EMIRATES.map((x) => (
                      <NativeSelectOption key={x} value={x}>
                        {x}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect className="w-full" aria-label="Industry" value={f.industry} onChange={set("industry")}>
                    <NativeSelectOption value="">Industry</NativeSelectOption>
                    {INDUSTRIES.map((x) => (
                      <NativeSelectOption key={x} value={x}>
                        {x}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </>
          )}
        </section>

        <section className="grid content-start gap-2">
          <h3 className={heading}>Contact person</h3>
          {existing.length > 0 && (
            <NativeSelect className="w-full" aria-label="Person" value={contactId} onChange={(e) => setContactId(e.target.value === "new" ? "new" : Number(e.target.value))}>
              {existing.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                  {p.jobTitle ? ` (${p.jobTitle})` : ""}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value="new">A new person…</NativeSelectOption>
            </NativeSelect>
          )}
          {contactId === "new" && (
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Name" placeholder="Name" value={f.contactName} onChange={set("contactName")} />
              <Input aria-label="Job title" placeholder="Job title" value={f.contactJobTitle} onChange={set("contactJobTitle")} />
              <Input aria-label="Phone or WhatsApp" placeholder="Phone / WhatsApp" value={f.contactPhone} onChange={set("contactPhone")} />
              <Input aria-label="Email" type="email" placeholder="Email" value={f.contactEmail} onChange={set("contactEmail")} />
            </div>
          )}
        </section>
      </div>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={heading}>Deal{stage !== "new" && <span className="ml-2 font-normal normal-case">starts at {stageLabel(stage)}</span>}</h3>
          {projectTypes.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border bg-muted/50 p-0.5" role="radiogroup" aria-label="Kind of deal">
                {(
                  [
                    { key: "product", label: "Product", icon: Package, title: "Supply of products (laptops, servers...)" },
                    { key: "project", label: "Project", icon: FolderKanban, title: "Site work (CCTV, cabling, server room...), tracked in Projects" },
                  ] as const
                ).map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    role="radio"
                    aria-checked={kind === k.key}
                    title={k.title}
                    onClick={() => setKind(k.key)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium [&_svg]:size-3.5 ${kind === k.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <k.icon /> {k.label}
                  </button>
                ))}
              </div>
              {kind === "project" && (
                <NativeSelect size="sm" aria-label="Project type" value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                  <NativeSelectOption value="">Project type…</NativeSelectOption>
                  {projectTypes.map((t) => (
                    <NativeSelectOption key={t.key} value={t.key}>
                      {t.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </div>
          )}
        </div>
        <Textarea
          aria-label="What do they want?"
          rows={3}
          value={f.requirement}
          onChange={set("requirement")}
          placeholder={
            kind === "project"
              ? "What is the work? e.g. 16 IP cameras for a 2-floor warehouse, NVR with 30 days recording, remote view on mobile, site in Al Quoz"
              : "What do they want? e.g. 20 x 14-inch laptops, i5, 16 GB, 512 GB, 3-year warranty, needed by month end"
          }
        />
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr]">
          <NativeSelect className="w-full" aria-label="Source" value={f.source} onChange={set("source")}>
            <NativeSelectOption value="">Source…</NativeSelectOption>
            {SOURCES.map((x) => (
              <NativeSelectOption key={x} value={x}>
                {x}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Input aria-label="Estimated value in AED" inputMode="decimal" placeholder="Value (AED)" value={f.value} onChange={set("value")} />
          <Input aria-label="Deal title (optional)" placeholder="Title (optional)" value={f.title} onChange={set("title")} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Assigned to</span>
          <AvatarPicker users={users} value={team} onChange={setTeam} />
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add deal"}
        </Button>
        {!onCreated && (
          <Button type="button" variant="ghost" onClick={goBack}>
            Cancel
          </Button>
        )}
        {missing ? (
          <span className="ml-auto text-xs font-medium text-amber-700 dark:text-amber-400" role="status">
            {missing}
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            Creates the company, person, deal{kind === "project" ? ", the project" : ""} and a follow-up for today.
          </span>
        )}
      </div>
    </form>
  );
}
