import { requirePlatform } from "@/platform/session";
import { getTrialRequest } from "@/platform/trials";
import { NewTenantForm } from "./new-tenant-form";

/** A new organisation; `?request=<id>` fills the form from a trial request, which is marked approved once it is made. */
export default async function NewTenantPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  await requirePlatform();
  const id = Number((await searchParams).request);
  const req = Number.isInteger(id) && id > 0 ? await getTrialRequest(id) : null;
  const from =
    req && req.status === "new"
      ? { requestId: req.id, name: req.company, adminName: req.contactName, adminEmail: req.email, note: [req.teamSize && `team of ${req.teamSize}`, req.phone, req.message].filter(Boolean).join(" · ") }
      : null;
  return <NewTenantForm from={from} />;
}
