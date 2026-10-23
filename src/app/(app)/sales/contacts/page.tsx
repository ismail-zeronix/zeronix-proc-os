import { Mail, MessageCircle, Phone, Search } from "lucide-react";
import Link from "next/link";
import { Empty } from "@/components/stat-tile";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { listContacts } from "@/lib/sales-data";

export const metadata = { title: "Contacts · Zeronix Sales" };

export default async function ContactsPage({ searchParams }: PageProps<"/sales/contacts">) {
  const access = await requireApp("sales");
  const { apps } = access;
  const sp = await searchParams;
  const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const rows = await listContacts(viewerOf(access), q);
  const canMail = apps.includes("mail");
  const icon = "inline-flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Contacts</h1>
        <span className="text-xs text-muted-foreground">{rows.length} {q ? "match" : "people"} · add people from a company page</span>
        <form action="/sales/contacts" className="relative ml-auto w-64 max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Name, email, phone, company" className="h-8 pl-8" aria-label="Search contacts" />
        </form>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Reach</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="py-1.5 font-medium">
                  {p.name}
                  {p.isDecisionMaker && <span className="ml-2 text-xs font-normal text-muted-foreground">decision maker</span>}
                </TableCell>
                <TableCell className="py-1.5">
                  <Link href={`/sales/companies/${p.companyId}`} className="hover:underline">
                    {p.companyName}
                  </Link>
                </TableCell>
                <TableCell className="py-1.5">{p.jobTitle || "-"}</TableCell>
                <TableCell className="py-1.5 text-xs text-muted-foreground">{p.email || "-"}</TableCell>
                <TableCell className="py-1.5">
                  <span className="flex gap-1.5">
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
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty>{q ? "Nobody matches." : "No contacts yet."}</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
