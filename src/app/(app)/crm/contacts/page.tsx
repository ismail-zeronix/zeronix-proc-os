import { Mail, MessageCircle, Phone, Search } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { LIST_PAGE } from "@/components/list-page";
import { PAGE_SIZE, Pager, pageParam } from "@/components/pager";
import { Input } from "@/components/ui/input";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { listContacts } from "@/lib/sales-data";
import { ContactBulkActions } from "../bulk-actions";

export const metadata = { title: "Contacts · Zeronix CRM" };

export default async function ContactsPage({ searchParams }: PageProps<"/crm/contacts">) {
  const access = await requireApp("crm");
  const { apps } = access;
  const sp = await searchParams;
  const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const page = pageParam(sp.page);
  const { rows, total } = await listContacts(viewerOf(access), q, page, PAGE_SIZE);
  const canMail = apps.includes("mail");
  const icon = "inline-flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5";
  const emails = Object.fromEntries(rows.filter((p) => p.email).map((p) => [p.id, p.email]));
  return (
    <div className={LIST_PAGE}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Contacts</h1>
        <span className="text-xs text-muted-foreground">
          {total.toLocaleString("en-US")} {q ? "match" : "people"} · add people from a company page
        </span>
        <form action="/crm/contacts" className="relative ml-auto w-64 max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Name, email, phone, company" className="h-8 pl-8" aria-label="Search contacts" />
        </form>
      </div>
      <DataTable
        noun="contact"
        total={total}
        acrossPages={false}
        empty={q ? "Nobody matches." : "No contacts yet."}
        actions={<ContactBulkActions emails={emails} canMail={canMail} />}
        pager={<Pager path="/crm/contacts" params={sp} page={page} total={total} showSingle />}
        columns={[
          { label: "Name", className: "py-1.5 font-medium" },
          { label: "Company", className: "py-1.5" },
          { label: "Job title", className: "py-1.5" },
          { label: "Email", className: "py-1.5" },
          { label: "Reach", className: "py-1.5" },
        ]}
        rows={rows.map((p) => ({
          id: p.id,
          cells: [
            <span key="n">
              {p.name}
              {p.isDecisionMaker && <span className="ml-2 text-xs font-normal text-muted-foreground">decision maker</span>}
            </span>,
            <Link key="c" href={`/crm/companies/${p.companyId}`} className="hover:underline">
              {p.companyName}
            </Link>,
            p.jobTitle || "-",
            <span key="e" className="text-xs text-muted-foreground">
              {p.email || "-"}
            </span>,
            <span key="r" className="flex gap-1.5">
              {p.phone && (
                <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className={icon} title={p.phone} aria-label={`Call ${p.name}`}>
                  <Phone />
                </a>
              )}
              {(p.whatsapp || p.phone) && (
                <a href={`https://wa.me/${(p.whatsapp || p.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className={icon} title="Open WhatsApp" aria-label={`WhatsApp ${p.name}`}>
                  <MessageCircle />
                </a>
              )}
              {p.email && canMail && (
                <Link href={`/mail/compose?to=${encodeURIComponent(p.email)}`} className={icon} title={`Write to ${p.email}`} aria-label={`Email ${p.name}`}>
                  <Mail />
                </Link>
              )}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
