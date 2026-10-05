import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readAuthConfig, verifySessionToken } from "@/lib/session";

/** Every route requires a session except the login page and the public PWA assets. */
export function proxy(request: NextRequest) {
  const auth = readAuthConfig();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (auth.ok && verifySessionToken(token, auth.config)) return NextResponse.next();

  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/login";
  url.search = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico|apple-icon|icon|robots.txt).*)",
  ],
};
