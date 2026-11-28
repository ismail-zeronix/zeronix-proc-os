import { TeamTargetsCard } from "@/app/(app)/admin/routine-ui";
import { teamTargets } from "@/lib/routine";
import { getSettings } from "@/lib/settings";
import { requireSettings } from "@/lib/settings/access";

export const metadata = { title: "Targets and check-ins · CRM settings" };

/** The sales team's daily and weekly targets, and how often they are asked what they have done. */
export default async function TargetsSettingsPage() {
  await requireSettings("targets");
  const s = await getSettings();
  return <TeamTargetsCard targets={teamTargets(s.sales_targets)} checkinMinutes={Number(s.checkin_minutes) || 0} />;
}
