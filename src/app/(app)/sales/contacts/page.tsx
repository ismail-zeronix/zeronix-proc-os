import { Mail, MessageCircle, Phone, Search } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/stat-tile";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireApp } from "@/lib/auth/session";
import { listContacts } from "@/lib/sales-data";

export const metadata = { title: "Contacts · Zeronix Sales" };

export default async function ContactsPage({ searchParams }: PageProps<"/sales/contacts">) {
  const { apps } = await requireApp("sales");
  const sp = await searchParams;
  const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const rows = await listContacts(q);
  const canMail = apps.includes("mail");
  return (
    <div className="grid gap-5">
      <PageHeader title="Contacts" description={`${rows.length} ${q ? "match" : "people"}. Add people from their company page.`} />
      <form action="/sales/contacts" className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Search by name, email, phone or company" className="pl-8" aria-label="Search contacts" />
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Reach</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.name}
                  {p.isDecisionMaker && <span className="ml-2 text-xs font-normal text-muted-foreground">decision maker</span>}
                </TableCell>
                <TableCell>
                  <Link href={`/sales/companies/${p.companyId}`} className="hover:underline">
                    {p.companyName}
                  </Link>
                </TableCell>
                <TableCell>{p.jobTitle || "-"}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    {p.phone && (
                      <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:underline">
                        <Phone className="size-3.5 text-muted-foreground" /> {p.phone}
                      </a>
                    )}
                    {(p.whatsapp || p.phone) && (
                      <a href={`https://wa.me/${(p.whatsapp || p.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                        <MessageCircle className="size-3.5 text-muted-foreground" /> WhatsApp
                      </a>
                    )}
                    {p.email &&
                      (canMail ? (
                        <Link href={`/mail/compose?to=${encodeURIComponent(p.email)}`} className="inline-flex items-center gap-1.5 hover:underline">
                          <Mail className="size-3.5 text-muted-foreground" /> {p.email}
                        </Link>
                      ) : (
                        <span>{p.email}</span>
                      ))}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={4}>
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
