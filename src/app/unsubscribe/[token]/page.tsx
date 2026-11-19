import { redirect } from "next/navigation";
import { unsubscribe } from "@/lib/newsletter/unsubscribe";

export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Opened from the footer link of a newsletter. Opening it changes nothing (mail scanners open links); the person presses
 * the button, which posts to this page's action. Public: no login (src/proxy.ts lets /unsubscribe/ through).
 */
export default async function UnsubscribePage({ params, searchParams }: PageProps<"/unsubscribe/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const done = sp.done === "1";
  const who = await unsubscribe(token, false);

  async function confirm() {
    "use server";
    await unsubscribe(token, true);
    redirect(`/unsubscribe/${token}?done=1`);
  }

  return (
    <main className="mx-auto grid min-h-svh max-w-md content-center gap-4 p-6 text-center">
      {!who.ok ? (
        <>
          <h1 className="text-xl font-semibold">This link is not valid</h1>
          <p className="text-sm text-muted-foreground">The unsubscribe link is incomplete or has been changed. Open the link in the email again, or reply to the email and ask us to remove you.</p>
        </>
      ) : who.test ? (
        <>
          <h1 className="text-xl font-semibold">Test email</h1>
          <p className="text-sm text-muted-foreground">This is the unsubscribe link of a test email, so it does nothing. In real newsletters it takes the reader off our list.</p>
        </>
      ) : done ? (
        <>
          <h1 className="text-xl font-semibold">You are unsubscribed</h1>
          <p className="text-sm text-muted-foreground">{who.email} will not receive our emails any more. This takes effect straight away.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Unsubscribe</h1>
          <p className="text-sm text-muted-foreground">Stop all emails from us to {who.email}?</p>
          <form action={confirm}>
            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">
              Yes, unsubscribe me
            </button>
          </form>
        </>
      )}
    </main>
  );
}
