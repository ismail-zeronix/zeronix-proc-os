import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/auth/setup";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Zeronix" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await isSetupComplete())) redirect("/setup");
  const { next } = await searchParams;
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm next={next} />
    </main>
  );
}
