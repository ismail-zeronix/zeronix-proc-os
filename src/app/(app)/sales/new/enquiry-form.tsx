"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { EMIRATES, INDUSTRIES, SOURCES } from "@/lib/sales";
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

export function EnquiryForm({ users, meId, preset }: { users: { id: number; name: string }[]; meId: number; preset: { id: number; name: string } | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [company, setCompany] = useState<Co | null>(preset ? { ...preset, emirate: "", industry: "" } : null);
  const [typed, setTyped] = useState("");
  const [debounced, setDebounced] = useState("");
  const [contactId, setContactId] = useState<number | "new">("new");
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
    ownerId: meId,
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
          ownerId: f.ownerId,
        });
        toast.success(res.reusedCompany ? `Added to the existing company "${res.reusedCompany}"` : "Enquiry added. A follow-up task is set for today.");
        router.push(`/sales/deals/${res.id}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Company</CardTitle>
          <CardDescription>Search first, so the same company is not added twice.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {company ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Check className="size-4 text-emerald-600" /> {company.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCompany(null);
                  setContactId("new");
                }}
              >
                <X /> Change
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type the company name" className="pl-8" aria-label="Company name" />
                {found.isFetching && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
              {found.data?.companies.length ? (
                <div className="grid gap-1 rounded-lg border p-1">
                  <p className="px-2 pt-1 text-xs text-muted-foreground">Already in the system. Pick one, or keep typing to add a new company.</p>
                  {found.data.companies.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => setCompany(c)}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{[c.emirate, c.industry].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {typed.trim().length >= 2 && !exact && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <p className="text-xs text-muted-foreground sm:col-span-2">A new company &quot;{typed.trim()}&quot; will be created.</p>
                  <div className="grid gap-1.5">
                    <Label htmlFor="enq-emirate">Emirate</Label>
                    <NativeSelect id="enq-emirate" value={f.emirate} onChange={set("emirate")}>
                      <NativeSelectOption value="">Not sure</NativeSelectOption>
                      {EMIRATES.map((x) => (
                        <NativeSelectOption key={x} value={x}>
                          {x}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="enq-industry">Industry</Label>
                    <NativeSelect id="enq-industry" value={f.industry} onChange={set("industry")}>
                      <NativeSelectOption value="">Not sure</NativeSelectOption>
                      {INDUSTRIES.map((x) => (
                        <NativeSelectOption key={x} value={x}>
                          {x}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Who are we dealing with?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {existing.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="enq-contact">Person</Label>
              <NativeSelect id="enq-contact" value={contactId} onChange={(e) => setContactId(e.target.value === "new" ? "new" : Number(e.target.value))}>
                {existing.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                    {p.jobTitle ? ` (${p.jobTitle})` : ""}
                  </NativeSelectOption>
                ))}
                <NativeSelectOption value="new">A new person…</NativeSelectOption>
              </NativeSelect>
            </div>
          )}
          {contactId === "new" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="enq-name">Name</Label>
                <Input id="enq-name" value={f.contactName} onChange={set("contactName")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="enq-job">Job title</Label>
                <Input id="enq-job" value={f.contactJobTitle} onChange={set("contactJobTitle")} placeholder="IT Manager" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="enq-phone">Phone / WhatsApp</Label>
                <Input id="enq-phone" value={f.contactPhone} onChange={set("contactPhone")} placeholder="+971 50 000 0000" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="enq-email">Email</Label>
                <Input id="enq-email" type="email" value={f.contactEmail} onChange={set("contactEmail")} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. The enquiry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="enq-req">What do they want?</Label>
            <Textarea id="enq-req" rows={4} value={f.requirement} onChange={set("requirement")} placeholder="20 x 14-inch laptops, i5, 16 GB, 512 GB, Windows 11 Pro, 3-year warranty. Needed by end of month." />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="enq-source">Where did it come from?</Label>
              <NativeSelect id="enq-source" value={f.source} onChange={set("source")}>
                <NativeSelectOption value="">Not sure</NativeSelectOption>
                {SOURCES.map((x) => (
                  <NativeSelectOption key={x} value={x}>
                    {x}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="enq-value">Estimated value (AED)</Label>
              <Input id="enq-value" inputMode="decimal" value={f.value} onChange={set("value")} placeholder="optional" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="enq-owner">Owner</Label>
              <NativeSelect id="enq-owner" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: Number(e.target.value) })}>
                {users.map((u) => (
                  <NativeSelectOption key={u.id} value={u.id}>
                    {u.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="enq-title">Deal title (optional)</Label>
            <Input id="enq-title" value={f.title} onChange={set("title")} placeholder="Made from the company and the request if you leave it empty" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSave}>
          {pending ? "Saving…" : "Add enquiry"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/sales")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
