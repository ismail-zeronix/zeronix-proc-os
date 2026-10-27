import { eq } from "drizzle-orm";
import { CalendarDays, CheckCircle2, Inbox, KeyRound, PenLine, XCircle } from "lucide-react";
import { AttendanceCard } from "@/components/attendance/attendance-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UrlTabs } from "@/components/url-tabs";
import { UserAvatar } from "@/components/user-avatar";
import { db, schema } from "@/db";
import { requireAccess } from "@/lib/auth/session";
import { ago } from "@/lib/format";
import { mailServer } from "@/lib/mail/config";
import { getBrand } from "@/lib/brand";
import { MailForm } from "./mail-form";
import { PasswordForm } from "./password-form";
import { SignatureCard } from "./signature-card";

export const metadata = { title: "My account · Zeronix" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const { user } = await requireAccess();
  const { month, tab } = await searchParams;
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
  const [{ version, ...brand }, [profile]] = await Promise.all([
    getBrand(),
    db
      .select({ jobTitle: schema.users.jobTitle, phone: schema.users.phone, mobile: schema.users.mobile })
      .from(schema.users)
      .where(eq(schema.users.id, user.id)),
  ]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <UserAvatar name={user.name} size={32} />
        <div className="grid min-w-0 leading-tight">
          <h1 className="truncate text-base font-semibold">My account</h1>
          <span className="truncate text-xs text-muted-foreground">
            {user.name} · {user.email}
          </span>
        </div>
        <Badge variant="outline" className="capitalize">
          {user.role}
        </Badge>
      </div>
      <UrlTabs
        initial={tab}
        tabs={[
          {
            key: "attendance",
            label: "Attendance",
            icon: <CalendarDays />,
            content: <AttendanceCard userId={user.id} month={month} canEdit basePath="/account" />,
          },
          {
            key: "mailbox",
            label: "Mailbox",
            icon: <Inbox />,
            content: (
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
            ),
          },
          {
            key: "signature",
            label: "Email signature",
            icon: <PenLine />,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>My email signature</CardTitle>
                  <CardDescription>Added automatically to every email you write in the portal.</CardDescription>
                </CardHeader>
                <CardContent>
                  <SignatureCard
                    brand={brand}
                    version={version}
                    name={user.name}
                    email={acc?.imapUser ?? user.email}
                    initial={profile ?? { jobTitle: "", phone: "", mobile: "" }}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            key: "security",
            label: "Password",
            icon: <KeyRound />,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Change your password</CardTitle>
                  <CardDescription>
                    Use at least 8 characters. After 5 wrong passwords in a row, signing in is blocked for 15 minutes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PasswordForm />
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
