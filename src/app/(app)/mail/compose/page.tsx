import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { getBrand } from "@/lib/brand";
import { MailAccessError, mailCreds } from "@/lib/mail/account";
import { formatRecipient, replyRecipients, subjectFor } from "@/lib/mail/compose";
import { loadMessage } from "@/lib/mail/message";
import { quoteForForward, quoteForReply } from "@/lib/mail/parse";
import { ComposeForm } from "./compose-form";

export const metadata = { title: "Write · Zeronix Mail" };

type Mode = "new" | "reply" | "replyall" | "forward";

export default async function ComposePage({ searchParams }: PageProps<"/mail/compose">) {
  await requireApp("mail");
  const sp = await searchParams;
  const asked = String(sp.mode ?? "new");
  const uid = Number(sp.uid);
  const mode: Mode = (["reply", "replyall", "forward"] as const).find((m) => m === asked) && Number.isInteger(uid) && uid > 0 ? (asked as Mode) : "new";

  let creds;
  try {
    creds = await mailCreds();
  } catch (e) {
    if (e instanceof MailAccessError) return <p className="p-4 text-sm text-destructive">{e.message}</p>;
    throw e;
  }

  const initial = { to: "", cc: "", subject: "", quote: "" };
  let loadError = "";
  if (mode !== "new") {
    try {
      const original = await loadMessage(creds, uid, false);
      initial.subject = subjectFor(mode, original.subject);
      if (mode === "forward") {
        initial.quote = quoteForForward(original);
      } else {
        const r = replyRecipients(mode, original, creds.login);
        initial.to = r.to.map(formatRecipient).join(", ");
        initial.cc = r.cc.map(formatRecipient).join(", ");
        initial.quote = quoteForReply(original);
      }
    } catch (e) {
      loadError = `Could not load the original email: ${(e as Error).message}`;
    }
  }

  const [{ version, ...brand }, [profile]] = await Promise.all([
    getBrand(),
    db
      .select({ jobTitle: schema.users.jobTitle, phone: schema.users.phone, mobile: schema.users.mobile })
      .from(schema.users)
      .where(eq(schema.users.id, creds.userId)),
  ]);

  return (
    <ComposeForm
      key={`${mode}-${uid}`}
      mode={mode}
      replyUid={mode === "new" ? 0 : uid}
      initial={initial}
      loadError={loadError}
      brand={brand}
      version={version}
      person={{ name: creds.name, email: creds.login, jobTitle: profile?.jobTitle ?? "", phone: profile?.phone ?? "", mobile: profile?.mobile ?? "" }}
    />
  );
}
