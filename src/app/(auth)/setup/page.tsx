import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/auth/setup";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Welcome · Zeronix Procurement" };

export default async function SetupPage() {
  if (await isSetupComplete()) redirect("/login");

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <SetupForm />
    </main>
  );
}
