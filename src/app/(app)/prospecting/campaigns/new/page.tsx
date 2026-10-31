import { eq } from "drizzle-orm";
import { BackButton } from "@/components/back-button";
import { db, schema } from "@/db";
import { requireApp } from "@/lib/auth/session";
import { getBrand } from "@/lib/brand";
import { industryCounts, sendingCapacity, writingBacklog } from "@/lib/prospecting/campaign-builder";
import { canWrite } from "@/lib/prospecting/writer";
import { CampaignChat } from "./campaign-chat";

export const metadata = { title: "New campaign · Zeronix Prospecting" };

/** Builds an email campaign as a short chat: industry, how many, what we offer, an example email, follow-ups, when. */
export default async function NewCampaignPage() {
  const { user } = await requireApp("prospecting");
  const [industries, segments, capacity, backlog, ai, brand, [profile]] = await Promise.all([
    industryCounts(),
    db.select({ label: schema.prospectSegments.label, offer: schema.prospectSegments.offer }).from(schema.prospectSegments).where(eq(schema.prospectSegments.active, true)),
    sendingCapacity(),
    writingBacklog(),
    canWrite(),
    getBrand(),
    db.select({ jobTitle: schema.users.jobTitle, phone: schema.users.phone, mobile: schema.users.mobile }).from(schema.users).where(eq(schema.users.id, user.id)),
  ]);
  const mailbox = capacity.mailboxes[0];
  const person = { name: mailbox ? mailbox.email : user.name, email: mailbox?.email ?? "", jobTitle: profile?.jobTitle ?? "", phone: profile?.phone ?? "", mobile: profile?.mobile ?? "" };
  const [box] = mailbox ? await db.select({ fromName: schema.outreachMailboxes.fromName }).from(schema.outreachMailboxes).where(eq(schema.outreachMailboxes.email, mailbox.email)) : [];
  if (box?.fromName) person.name = box.fromName;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback="/prospecting/campaigns" />
        <h1 className="text-lg font-semibold tracking-tight">New campaign</h1>
      </div>
      <CampaignChat
        industries={industries}
        offers={segments.filter((s) => s.offer.trim()).map((s) => ({ label: s.label, offer: s.offer.trim() }))}
        capacity={capacity}
        backlog={backlog}
        aiReady={ai}
        brand={brand}
        person={person}
        logoSrc={`/api/brand/logo?v=${brand.version}`}
      />
    </div>
  );
}
