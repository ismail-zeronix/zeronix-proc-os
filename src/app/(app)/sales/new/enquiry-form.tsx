"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AvatarPicker } from "@/components/avatar-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { EMIRATES, INDUSTRIES, SOURCES, stageLabel } from "@/lib/sales";
import { createEnquiry } from "../actions";

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
 * One compact form for a new enquiry: company, person and the request side by side.
 * Used as a page (opens the new deal afterwards) and inside the "+" dialog on a board column (stays on the board).
 */
export function EnquiryForm({
  users,
  meId,
  preset,
  stage = "new",
  onCreated,
}: {
  users: { id: number; name: string }[];
  meId: number;
  preset: { id: number; name: string } | null;
  stage?: string;
  onCreated?: (dealId: number) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [company, setCompany] = useState<Co | null>(preset ? { ...preset, emirate: "", industry: "" } : null);
  const [typed, setTyped] = useState("");
  const [debounced, setDebounced] = useState("");
  const [contactId, setContactId] = useState<number | "new">("new");
  const [team, setTeam] = useState<number[]>([meId]);
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
  const canSave = !pending && (company || typed.trim().length >= 2) && (f.requirement.trim() || f.contactName.trim() || contactId !== "new");

  const save = () =>
    start(async () => {
      try {
        const value = f.value.trim() ? Number(f.value.replace(/,/g, "")) : null;
        if (value !== null && !Number.isFinite(value)) throw new Error("The value must be a number.");
        const res = await createEnquiry({
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
        });
        toast.success(res.reusedCompany ? `Added to the existing company "${res.reusedCompany}"` : "Enquiry added", {
          action: onCreated ? { label: "Open deal", onClick: () => router.push(`/sales/deals/${res.id}`) } : undefined,
        });
        if (onCreated) onCreated(res.id);
        else router.push(`/sales/deals/${res.id}`);
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
        if (canSave) save();
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
        <h3 className={heading}>Enquiry{stage !== "new" && <span className="ml-2 font-normal normal-case">starts at {stageLabel(stage)}</span>}</h3>
        <Textarea
          aria-label="What do they want?"
          rows={3}
          value={f.requirement}
          onChange={set("requirement")}
          placeholder="What do they want? e.g. 20 x 14-inch laptops, i5, 16 GB, 512 GB, 3-year warranty, needed by month end"
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
        <Button type="submit" disabled={!canSave}>
          {pending ? "Saving…" : "Add enquiry"}
        </Button>
        {!onCreated && (
          <Button type="button" variant="ghost" onClick={() => router.push("/sales/pipeline")}>
            Cancel
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Creates the company, person, deal and a follow-up for today.</span>
      </div>
    </form>
  );
}
