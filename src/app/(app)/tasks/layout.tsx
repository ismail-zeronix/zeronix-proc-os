import { PortalHeader } from "@/components/portal-header";
import { requireApp } from "@/lib/auth/session";

export default async function TasksLayout({ children }: LayoutProps<"/tasks">) {
  await requireApp("tasks");
  return (
    <div className="flex min-h-svh flex-col">
      <PortalHeader />
      <div className="mx-auto w-full max-w-4xl flex-1 p-4 md:p-6">{children}</div>
    </div>
  );
}
