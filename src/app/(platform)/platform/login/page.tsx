import { redirect } from "next/navigation";
import { loadPlatformAdmin } from "@/platform/session";
import { PlatformLoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform sign-in · ZeronixOS" };

export default async function PlatformLogin() {
  if (await loadPlatformAdmin()) redirect("/platform");
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <PlatformLoginForm />
    </main>
  );
}
