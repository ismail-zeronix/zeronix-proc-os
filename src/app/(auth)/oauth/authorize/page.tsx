import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAccess } from "@/lib/auth/session";
import { checkAuthorizeRequest } from "@/lib/mcp/oauth";
import { claudeAllowed, isLoopback, parseScope } from "@/lib/mcp/oauth-rules";
import { ConsentForm } from "./consent-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect Claude · Zeronix" };

type Params = Record<string, string | undefined>;

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">{children}</main>;
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{text}</CardDescription>
        </CardHeader>
      </Card>
    </Shell>
  );
}

/**
 * The OAuth consent page of the Claude connector. Claude sends the admin or salesperson here (after the normal sign-in); Allow sends
 * them back to Claude with a one-time code. A bad app or return address is shown here and never redirected anywhere.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const access = await requireAccess();
  const p = await searchParams;
  const clientId = p.client_id ?? "";
  const redirectUri = p.redirect_uri ?? "";
  const client = await checkAuthorizeRequest(clientId, redirectUri);
  if (!client) return <Problem title="Link not valid" text="This sign-in link is not valid or has expired. Start again from Claude (Settings › Connectors)." />;
  if (p.response_type !== "code" || p.code_challenge_method !== "S256" || !p.code_challenge) {
    return <Problem title="Link not valid" text="Claude sent an incomplete sign-in request. Remove the connector in Claude and add it again." />;
  }
  if (!claudeAllowed(access.user.role)) return <Problem title="Not available" text="Your account cannot connect Claude to Zeronix OS. Ask an admin if you need it." />;

  return (
    <Shell>
      <ConsentForm
        userName={access.user.name}
        appName={client.name || "Claude"}
        host={new URL(redirectUri).host}
        loopback={isLoopback(redirectUri)}
        askedWrite={parseScope(p.scope).includes("write")}
        hidden={{ client_id: clientId, redirect_uri: redirectUri, state: p.state ?? "", code_challenge: p.code_challenge }}
      />
    </Shell>
  );
}
