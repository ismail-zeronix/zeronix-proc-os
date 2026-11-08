import Link from "next/link";
import type { LegalDoc } from "@/content/legal";

/** A terms or privacy page: public, plain and readable on a phone. Says so plainly while the text is still a draft. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className="min-h-svh bg-muted/30 px-4 py-8">
      <article className="mx-auto grid max-w-2xl gap-5 rounded-xl border bg-card p-5 text-sm leading-relaxed md:p-8">
        {!doc.approved && (
          <p role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Draft for review: this text is not yet in force.
          </p>
        )}
        <header className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
          {doc.approved && doc.effective && <p className="text-xs text-muted-foreground">In force from {doc.effective}</p>}
        </header>
        {doc.sections.map((s) => (
          <section key={s.heading} className="grid gap-1.5">
            <h2 className="font-medium">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}
        <footer className="flex gap-4 border-t pt-4 text-xs text-muted-foreground">
          <Link href="/legal/terms" className="hover:underline">
            Terms of service
          </Link>
          <Link href="/legal/privacy" className="hover:underline">
            Privacy notice
          </Link>
          <Link href="/login" className="ml-auto hover:underline">
            Sign in
          </Link>
        </footer>
      </article>
    </main>
  );
}
