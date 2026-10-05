import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { safeNextPath } from "@/lib/session";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const target = safeNextPath(Array.isArray(next) ? next[0] : next);
  if (await isAuthenticated()) redirect(target);
  return (
    <main className="pt-safe flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <img src="/icons/icon-192.png" alt="" width={56} height={56} className="mx-auto rounded-2xl" />
          <h1 className="text-xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-sm text-muted">Private dashboard. Enter your password to continue.</p>
        </div>
        <LoginForm next={target} />
      </div>
    </main>
  );
}
