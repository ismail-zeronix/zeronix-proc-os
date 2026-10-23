import { PortalHeader } from "@/components/portal-header";
import { requireApp } from "@/lib/auth/session";

export default async function TasksLayout({ children }: LayoutProps<"/tasks">) {
  await requireApp("tasks");
  return (
    <div className="flex min-h-svh flex-col">
      <PortalHeader />
      <div className="mx-auto w-full max-w-5xl flex-1 p-3 md:p-4">{children}</div>
    </div>
  );
}
