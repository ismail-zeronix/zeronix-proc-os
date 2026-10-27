import { PortalHeader } from "@/components/portal-header";

/** Home screen: full-width header, no sidebar. */
export default function HomeLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <PortalHeader />
      <div className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</div>
    </div>
  );
}
