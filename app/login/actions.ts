"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearFailures, isLockedOut, recordFailure } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, checkPassword, createSessionToken, readAuthConfig, safeNextPath } from "@/lib/session";

export type LoginState = { error?: string };

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const auth = readAuthConfig();
  if (!auth.ok) return { error: `Server not configured: ${auth.reason}` };
  const key = await clientKey();
  if (isLockedOut(key)) return { error: "Too many attempts. Try again in 15 minutes." };

  const password = String(form.get("password") ?? "");
  if (!checkPassword(password, auth.config)) {
    recordFailure(key);
    return { error: "Incorrect password." };
  }
  clearFailures(key);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(auth.config), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect(safeNextPath(form.get("next")));
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
