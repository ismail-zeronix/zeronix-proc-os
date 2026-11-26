import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { zeronixFeatures } from "@/lib/edition";
import { TrialForm } from "./trial-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request a free trial · ZeronixOS" };

/** The SaaS install's "Request a free trial": the platform console approves it into a company with its invitation. */
export default function RequestTrialPage() {
  if (zeronixFeatures()) notFound();
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="relative w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Try ZeronixOS free for 30 days</CardTitle>
          <CardDescription>CRM, quotes, invoices with UAE VAT, projects, tasks and team chat in one place. No card needed.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TrialForm />
          <Link href="/login" className="text-sm font-medium hover:underline">
            Already have an account? Sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
