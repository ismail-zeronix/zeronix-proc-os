import { asc, eq } from "drizzle-orm";
import { NotifySettings } from "@/app/(app)/admin/notify-ui";
import { db, schema } from "@/db";
import { ruleConfigs, RULES } from "@/lib/notifications/rules";
import { getSettings } from "@/lib/settings";
import { requireSettings } from "@/lib/settings/access";

export const metadata = { title: "Notifications · Settings" };

export default async function NotificationSettingsPage() {
  await requireSettings("notifications");
  const [settings, mailboxes] = await Promise.all([
    getSettings(),
    db
      .select({ id: schema.mailAccounts.id, address: schema.mailAccounts.imapUser, owner: schema.users.name, enabled: schema.mailAccounts.enabled })
      .from(schema.mailAccounts)
      .innerJoin(schema.users, eq(schema.users.id, schema.mailAccounts.userId))
      .orderBy(asc(schema.mailAccounts.imapUser)),
  ]);
  return <NotifySettings rules={[...RULES]} configs={ruleConfigs(settings.notify_rules)} mailboxes={mailboxes} digestFrom={settings.notify_digest_from} />;
}
