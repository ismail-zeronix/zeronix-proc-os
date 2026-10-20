import { eq } from "drizzle-orm";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, schema } from "@/db";
import { requireAccess } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { mailServer } from "@/lib/mail/config";
import { MailForm } from "./mail-form";

export const metadata = { title: "My account · Zeronix" };

export default async function AccountPage() {
  const { user } = await requireAccess();
  const [acc] = await db
    .select({
      imapUser: schema.mailAccounts.imapUser,
      enabled: schema.mailAccounts.enabled,
      lastCheckedAt: schema.mailAccounts.lastCheckedAt,
      lastStatus: schema.mailAccounts.lastStatus,
      lastError: schema.mailAccounts.lastError,
    })
    .from(schema.mailAccounts)
    .where(eq(schema.mailAccounts.userId, user.id));
  const { host } = mailServer();

  return (
    <div className="grid gap-6">
      <PageHeader title="My account" description={`${user.name} · ${user.email}`} />
      <Card>
        <CardHeader>
          <CardTitle>My mailbox</CardTitle>
          <CardDescription>
            Shows your newest emails on the home screen. Only sender, subject and time are kept, never the message text, and only you
            see them. Server: {host}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {acc && (
            <div className="flex items-start gap-2 text-sm">
              {acc.lastStatus === "ok" ? (
                <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
              ) : (
                <XCircle className="mt-0.5 size-4 text-destructive" />
              )}
              <div>
                <div className="font-medium">{acc.imapUser}</div>
                <div className="text-muted-foreground">
                  {!acc.enabled
                    ? `Paused. ${acc.lastError || "Connect it again."}`
                    : acc.lastStatus === "ok"
                      ? `Connected. Checked ${acc.lastCheckedAt ? ago(acc.lastCheckedAt) : "just now"}.`
                      : acc.lastStatus === "error"
                        ? `Problem: ${acc.lastError}`
                        : "Connected. First check is coming up."}
                </div>
              </div>
            </div>
          )}
          <MailForm connected={!!acc} imapUser={acc?.imapUser ?? ""} defaultEmail={user.email} />
        </CardContent>
      </Card>
    </div>
  );
}
