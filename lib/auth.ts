import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, readAuthConfig, verifySessionToken } from "./session";

/** True when the request carries a valid session cookie. */
export async function isAuthenticated(): Promise<boolean> {
  const auth = readAuthConfig();
  if (!auth.ok) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, auth.config);
}

/**
 * Defence in depth: the proxy already guards every route, but data loaders and
 * server actions call this too, so a proxy bypass can't expose data.
 */
export async function requireSession(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/login");
}

// --- Best-effort login throttling -------------------------------------------
// Serverless instances don't share memory, so this only slows a brute-force
// attempt per instance. The real protection is a long random password
// (enforced ≥ 12 chars). See README › Security.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; first: number }>();

export function isLockedOut(clientKey: string, now = Date.now()): boolean {
  const f = failures.get(clientKey);
  if (!f) return false;
  if (now - f.first > WINDOW_MS) {
    failures.delete(clientKey);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

export function recordFailure(clientKey: string, now = Date.now()): void {
  const f = failures.get(clientKey);
  if (!f || now - f.first > WINDOW_MS) failures.set(clientKey, { count: 1, first: now });
  else f.count++;
}

export function clearFailures(clientKey: string): void {
  failures.delete(clientKey);
}
