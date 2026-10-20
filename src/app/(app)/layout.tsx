import { requireAccess } from "@/lib/auth/session";

/** Every signed-in page. Each app (and the home screen) adds its own header, and a sidebar where it has one. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireAccess();
  return children;
}
