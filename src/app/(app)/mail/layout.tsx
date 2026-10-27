import { eq } from "drizzle-orm";
import { PortalHeader } from "@/components/portal-header";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { mailServer } from "@/lib/mail/config";
import { MailNotReady } from "./mail-not-ready";
import { MailShell } from "./mail-shell";

export default async function MailLayout({ children }: LayoutProps<"/mail">) {
  const { user } = await requireApp("mail");
  const [acc] = await db
    .select({ enabled: schema.mailAccounts.enabled, lastError: schema.mailAccounts.lastError })
    .from(schema.mailAccounts)
    .where(eq(schema.mailAccounts.userId, user.id));
  return (
    <div className="flex h-svh flex-col">
      <PortalHeader />
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col p-2 md:p-4">
        {!acc || !acc.enabled ? <MailNotReady paused={!!acc} reason={acc?.lastError ?? ""} /> : <MailShell webmailUrl={mailServer().webmailUrl}>{children}</MailShell>}
      </div>
    </div>
  );
}
