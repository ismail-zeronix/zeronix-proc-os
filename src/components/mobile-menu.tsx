"use client";

import { Download, LogOut, Moon, Share, Sun, UserCog, X } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/(auth)/login/actions";
import { promptInstall, useInstallMode } from "@/components/pwa/install";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { navFor, type NavItem, type NavPerms } from "@/lib/app-nav";
import { APPS, appOfPath, type AppKey, type Role } from "@/lib/apps";

/**
 * The phone menu behind the bottom bar's Menu tab: the pages of the app you are in (what the sidebar holds on
 * desktop), every app you can open, and your account, theme, install and sign out.
 */
export function MobileMenu({
  open,
  onOpenChange,
  user,
  visible,
  punchedIn,
  perms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { name: string; email: string; role: Role };
  visible: string[];
  punchedIn: boolean;
  perms?: NavPerms;
}) {
  const pathname = usePathname();
  const current = appOfPath(pathname);
  const groups = current ? navFor(current.key as AppKey, perms) : [];
  const switcher = APPS.filter((a) => visible.includes(a.key));
  const close = () => onOpenChange(false);

  const under = (base: string) => pathname.startsWith(base + "/");
  const active = (n: NavItem) => pathname === n.href || (!n.exact && under(n.href)) || !!n.also?.some(under);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-popover px-4 py-2">
          <span aria-hidden className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30" />
          <div className="min-w-0 flex-1 pt-1">
            <SheetTitle className="truncate text-sm font-semibold">{user.name}</SheetTitle>
            <SheetDescription className="truncate text-xs">{user.email}</SheetDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Close menu" title="Close" data-punch-allow className="size-10">
            <X />
          </Button>
        </div>

        {groups.length > 0 && current && (
          <section className="border-b px-2 py-2" aria-label={`${current.label} pages`}>
            <p className="flex items-center gap-2 px-2 pb-1 text-xs font-medium text-muted-foreground">
              <span className="flex size-5 items-center justify-center rounded text-white" style={{ background: current.color }}>
                <current.icon className="size-3" />
              </span>
              {current.label}
            </p>
            <ul className="grid grid-cols-2 gap-0.5">
              {groups.flatMap((g) => g.items).map((n) => {
                const on = active(n);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      onClick={close}
                      aria-current={on ? "page" : undefined}
                      className={`flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm ${on ? "bg-muted font-medium text-foreground" : "text-foreground/90 active:bg-muted"}`}
                    >
                      <n.icon className={`size-4 shrink-0 ${on ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="truncate">{n.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="border-b px-2 py-2" aria-label="Apps">
          <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Apps</p>
          <ul className="grid grid-cols-4 gap-1">
            {switcher.map((a) => (
              <li key={a.key}>
                {a.status === "live" ? (
                  <Link
                    href={a.href}
                    onClick={close}
                    aria-current={current?.key === a.key ? "true" : undefined}
                    className={`grid justify-items-center gap-1 rounded-lg px-1 py-2 text-[11px] leading-tight active:bg-muted ${current?.key === a.key ? "bg-muted font-medium" : ""}`}
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl text-white" style={{ background: a.color }}>
                      <a.icon className="size-5" />
                    </span>
                    <span className="max-w-full truncate">{a.label}</span>
                  </Link>
                ) : (
                  <span title="Coming soon" className="grid justify-items-center gap-1 px-1 py-2 text-[11px] leading-tight text-muted-foreground opacity-50">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                      <a.icon className="size-5" />
                    </span>
                    <span className="max-w-full truncate">{a.label}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="px-2 py-2" aria-label="Account">
          <ul className="grid gap-0.5">
            <li>
              <MenuLink href="/account" onClick={close} icon={UserCog} disabled={!punchedIn}>
                My account and mailbox
              </MenuLink>
            </li>
            <li>
              <ThemeRow />
            </li>
            <InstallRow />
            <li>
              <form action={logout}>
                <button type="submit" data-punch-allow className={`${ROW} w-full text-destructive`}>
                  <LogOut className="size-4" /> Sign out
                </button>
              </form>
            </li>
          </ul>
        </section>
      </SheetContent>
    </Sheet>
  );
}

const ROW = "flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-left text-sm active:bg-muted";

function MenuLink({
  href,
  onClick,
  icon: Icon,
  disabled,
  children,
}: {
  href: string;
  onClick: () => void;
  icon: typeof UserCog;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} onClick={onClick} className={ROW} data-punch-allow={!disabled || undefined}>
      <Icon className="size-4 text-muted-foreground" /> {children}
    </Link>
  );
}

function ThemeRow() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button type="button" data-punch-allow onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className={`${ROW} w-full`}>
      <Sun className="hidden size-4 text-muted-foreground dark:block" />
      <Moon className="size-4 text-muted-foreground dark:hidden" />
      <span className="dark:hidden">Dark theme</span>
      <span className="hidden dark:inline">Light theme</span>
    </button>
  );
}

/** "Install app" where the browser offers it; on an iPhone, how to add it from Safari's Share menu. */
function InstallRow() {
  const mode = useInstallMode();
  const [help, setHelp] = useState(false);
  if (!mode) return null;
  return (
    <li>
      <button type="button" data-punch-allow onClick={() => (mode === "prompt" ? promptInstall() : setHelp(!help))} className={`${ROW} w-full`}>
        <Download className="size-4 text-muted-foreground" /> Install Zeronix OS on this device
      </button>
      {help && (
        <p className="mx-2 mb-1 rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          In Safari, tap <Share className="inline size-3.5 align-text-bottom" /> <b>Share</b>, then <b>Add to Home Screen</b>. Zeronix OS then opens
          from its own icon, full screen.
        </p>
      )}
    </li>
  );
}
