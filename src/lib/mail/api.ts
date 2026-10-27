import "server-only";
import { accessStatus, MailAccessError, mailCreds, type MailCreds } from "./account";

/** Runs a Mail API handler for the signed-in user and turns access problems and mail-server errors into JSON. */
export async function mailApi(handler: (creds: MailCreds) => Promise<Response>): Promise<Response> {
  try {
    return await handler(await mailCreds());
  } catch (e) {
    if (e instanceof MailAccessError) {
      return Response.json({ error: e.message, code: e.code }, { status: accessStatus(e) });
    }
    return Response.json({ error: (e as Error).message, code: "error" }, { status: 502 });
  }
}
