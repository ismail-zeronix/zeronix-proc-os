import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lookupInvite } from "@/lib/invites";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join · ZeronixOS" };

/** An invitation link: who it is for and which company, then their name and a password of their own. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await lookupInvite(token);
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{inv ? `Join ${inv.orgName}` : "Invitation"}</CardTitle>
          <CardDescription>{inv && !inv.problem ? `on ZeronixOS, as ${inv.email}` : "ZeronixOS"}</CardDescription>
        </CardHeader>
        <CardContent>
          {!inv ? (
            <p className="text-sm text-muted-foreground">This link is not valid. Ask whoever sent it for a new one.</p>
          ) : inv.problem ? (
            <div className="grid gap-3 text-sm">
              <p className="text-muted-foreground">{inv.problem}</p>
              <Link href="/login" className="font-medium hover:underline">
                Go to sign in
              </Link>
            </div>
          ) : (
            <JoinForm token={token} name={inv.name} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
