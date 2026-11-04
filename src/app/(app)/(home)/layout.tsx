import { PortalHeader } from "@/components/portal-header";

/** Home screen: full-width header, no sidebar. */
export default function HomeLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col pb-(--mobile-nav-h)">
      <PortalHeader />
      <div className="mx-auto w-full max-w-6xl flex-1 p-3 md:p-6">{children}</div>
    </div>
  );
}
