import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { platformMailReady } from "@/lib/platform-mail";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password · ZeronixOS" };

/** Asks for a "choose a new password" link by email (only where the platform mailbox is set up). */
export default function ForgotPasswordPage() {
  const ready = platformMailReady();
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Forgot your password?</CardTitle>
          <CardDescription>{ready ? "We email you a link to choose a new one." : "ZeronixOS"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {ready ? <ForgotForm /> : <p className="text-sm text-muted-foreground">Ask your company&apos;s admin to set a new password for you (Admin › Users).</p>}
          <Link href="/login" className="text-sm font-medium hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
