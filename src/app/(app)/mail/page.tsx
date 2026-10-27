import { Mail } from "lucide-react";

export const metadata = { title: "Mail · Zeronix" };

/** The right-hand pane on a wide screen before an email is chosen. (On a phone only the list shows.) */
export default function MailHomePage() {
  return (
    <div className="grid h-full min-h-64 place-content-center justify-items-center gap-2 p-8 text-center text-muted-foreground">
      <Mail className="size-8" />
      <p className="text-sm">Choose an email to read it, or press Write to start a new one.</p>
    </div>
  );
}
