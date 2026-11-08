import { NextResponse } from "next/server";
import { PLATFORM_COOKIE } from "@/lib/auth/platform-token";
import { SESSION_COOKIE } from "@/lib/auth/token";

/** Signs out of the console, and ends any support visit with it. */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/platform/login", req.url));
  res.cookies.delete(PLATFORM_COOKIE);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
