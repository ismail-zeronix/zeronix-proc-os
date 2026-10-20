import { PortalHeader } from "@/components/portal-header";
import { requireAccess } from "@/lib/auth/session";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  await requireAccess();
  return (
    <div className="flex min-h-svh flex-col">
      <PortalHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6">{children}</div>
    </div>
  );
}
