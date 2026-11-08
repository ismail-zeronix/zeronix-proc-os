import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/auth/setup";
import { SetupForm } from "./setup-form";

// Never prerender: the build has no database to check for the first admin.
export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome · Zeronix Procurement" };

export default async function SetupPage() {
  // a multi-tenant install never makes its first admin from the web: organisations come from the platform console
  if (process.env.MULTI_TENANT === "true" || (await isSetupComplete())) redirect("/login");

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <SetupForm />
    </main>
  );
}
