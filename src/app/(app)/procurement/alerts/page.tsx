import { redirect } from "next/navigation";

/** Price alerts were folded into Search (trend arrows on every offer, "Newest first"). */
export default function AlertsPage() {
  redirect("/procurement?sort=recent");
}
