import { PunchGate } from "@/components/attendance/punch-gate";
import { ChatWidget } from "@/components/chat/chat-widget";
import { punchState } from "@/lib/attendance-data";
import { requireAccess } from "@/lib/auth/session";

/**
 * Every signed-in page. Each app (and the home screen) adds its own header, and a sidebar where it has one. Nothing works
 * until the user punches in. The team chat sits bottom-right on every page once they have.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireAccess();
  const { punchedIn } = await punchState(user.id);
  return (
    <>
      <PunchGate locked={!punchedIn} />
      {punchedIn && <ChatWidget me={{ id: user.id, name: user.name }} />}
      {children}
    </>
  );
}
