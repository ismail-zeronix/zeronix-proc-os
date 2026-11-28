import { WorkHoursSettings } from "@/app/(app)/admin/admin-ui";
import { getSettings } from "@/lib/settings";
import { requireSettings } from "@/lib/settings/access";

export const metadata = { title: "Work hours · Settings" };

export default async function WorkHoursPage() {
  await requireSettings("hours");
  return <WorkHoursSettings settings={await getSettings()} />;
}
