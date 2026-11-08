import { requirePlatform } from "@/platform/session";
import { NewTenantForm } from "./new-tenant-form";

export default async function NewTenantPage() {
  await requirePlatform();
  return <NewTenantForm />;
}
