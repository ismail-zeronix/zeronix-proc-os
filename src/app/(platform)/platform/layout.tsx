import Link from "next/link";
import { loadPlatformAdmin } from "@/platform/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform · ZeronixOS" };

/**
 * The platform console (god mode): the organisations on this install and what the platform team did. Its own sign-in
 * (password + authenticator code) and its own database role; nothing here is part of any organisation's portal.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await loadPlatformAdmin();
  return (
    <div className="min-h-svh bg-muted/30">
      {admin && (
        <header className="sticky top-0 z-40 border-b bg-neutral-950 text-neutral-100">
          <div className="mx-auto flex h-11 max-w-6xl items-center gap-4 px-4 text-sm">
            <Link href="/platform" className="font-semibold tracking-tight">
              ZeronixOS Platform
            </Link>
            <nav className="flex gap-3 text-neutral-300">
              <Link href="/platform" className="hover:text-white">
                Organisations
              </Link>
              <Link href="/platform/new" className="hover:text-white">
                New organisation
              </Link>
            </nav>
            <span className="ml-auto truncate text-neutral-400">{admin.name}</span>
            <a href="/platform/signout" className="text-neutral-300 hover:text-white">
              Sign out
            </a>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
