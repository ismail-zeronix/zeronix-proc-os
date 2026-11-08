import { PLATFORM_COOKIE } from "@/lib/auth/platform-token";
import { SESSION_COOKIE } from "@/lib/auth/token";

/** Signs out of the console, and ends any support visit with it. Relative redirect: right behind any proxy. */
export async function GET() {
  const headers = new Headers({ Location: "/platform/login" });
  headers.append("Set-Cookie", `${PLATFORM_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 303, headers });
}
