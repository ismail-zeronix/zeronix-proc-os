import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lookupReset } from "@/lib/auth/password-reset";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New password · ZeronixOS" };

/** A "forgot password" link: choose a new password, or why the link no longer works. */
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await lookupReset(token);
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Choose a new password</CardTitle>
          <CardDescription>{info && !info.problem ? `for ${info.email}` : "ZeronixOS"}</CardDescription>
        </CardHeader>
        <CardContent>
          {info && !info.problem ? (
            <ResetForm token={token} />
          ) : (
            <div className="grid gap-3 text-sm">
              <p className="text-muted-foreground">{info?.problem ?? "This link is not valid. Ask for a new one."}</p>
              <Link href="/forgot-password" className="font-medium hover:underline">
                Ask for a new link
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
