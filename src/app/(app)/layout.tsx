import { CheckInPrompt } from "@/components/attendance/check-in";
import { BillingBanner } from "@/components/billing-notice";
import { PunchGate } from "@/components/attendance/punch-gate";
import { ChatWidget } from "@/components/chat/chat-widget";
import { ExportWatcher } from "@/components/export-button";
import { MobileNav } from "@/components/mobile-nav";
import { punchState } from "@/lib/attendance-data";
import { visibleApps } from "@/lib/apps";
import { requireAccess } from "@/lib/auth/session";
import { zeronixFeatures } from "@/lib/edition";
import { orgProfile } from "@/lib/org";
import { routineFor } from "@/lib/routine-data";
import { SupportBanner } from "@/components/support-banner";

/**
 * Every signed-in page. Each app (and the home screen) adds its own header, and a sidebar where it has one. Nothing works
 * until the user punches in. The team chat sits bottom-right on every page once they have; on phones the bottom bar
 * (Home, Chat, Tasks, Alerts, Menu) takes its place.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, apps, accountant, seesAll, support, orgId } = await requireAccess();
  // a support visitor looks around without punching in (they cannot punch in for the person, nor change anything read-only)
  const punchedIn = support ? true : (await punchState(user.id)).punchedIn;
  const orgName = support ? ((await orgProfile(orgId).catch(() => null))?.name ?? "this organisation") : "";
  // the sales routine check-in (Zeronix's own, lib/edition.ts) rings only for people on it, while punched in, never for
  // a support visitor
  const routine = punchedIn && !support && zeronixFeatures() ? await routineFor(user.id) : null;
  const visible = visibleApps({ role: user.role, apps }).map((a) => a.key);
  return (
    <>
      {support && <SupportBanner adminName={support.adminName} orgName={orgName} readOnly={support.readOnly} />}
      {/* the last week of the trial or paid period, or past it: a line for the organisation's admins (SaaS only) */}
      {!support && <BillingBanner isAdmin={user.role === "admin"} />}
      <PunchGate locked={!punchedIn} />
      <ExportWatcher />
      {punchedIn && <ChatWidget me={{ id: user.id, name: user.name, isAdmin: user.role === "admin" }} />}
      {routine && <CheckInPrompt me={user.id} name={user.name} />}
      {children}
      <MobileNav user={{ name: user.name, email: user.email, role: user.role }} apps={apps} visible={visible} punchedIn={punchedIn} perms={{ accountant, seesAll, outreachFull: seesAll, zeronix: zeronixFeatures() }} />
    </>
  );
}
