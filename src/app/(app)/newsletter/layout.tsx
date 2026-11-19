import { AppShell } from "@/components/app-shell";
import { requireApp } from "@/lib/auth/session";

export default async function NewsletterLayout({ children }: LayoutProps<"/newsletter">) {
  await requireApp("newsletter");
  return <AppShell app="newsletter">{children}</AppShell>;
}
