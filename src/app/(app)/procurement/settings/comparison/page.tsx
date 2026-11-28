import { AdminSettings } from "@/app/(app)/admin/admin-ui";
import { getSettings } from "@/lib/settings";
import { requireSettings } from "@/lib/settings/access";

export const metadata = { title: "Price comparison · Procurement settings" };

/** When a supplier price counts as old, and the dollar rate prices are compared at. */
export default async function ComparisonSettingsPage() {
  await requireSettings("comparison");
  return <AdminSettings settings={await getSettings()} />;
}
