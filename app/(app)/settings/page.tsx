import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { getDataSource } from "@/lib/data";
import { geminiConfigured } from "@/lib/gemini";
import { CircleCheck, CircleDashed } from "lucide-react";
import { THEME_COOKIE, parseTheme } from "@/lib/preferences";
import { USD_TO_AED } from "@/lib/calculations";
import { ThemeToggle } from "@/components/theme-toggle";
import { CurrencyToggle } from "@/components/currency";
import { Card } from "@/components/ui";
import { logout } from "@/app/login/actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const source = getDataSource().kind;
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Card className="space-y-3">
        <h2 className="text-sm font-medium">Appearance</h2>
        <ThemeToggle initial={theme} />
      </Card>
      <Card className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Currency</h2>
          <p className="text-xs text-muted">Fixed rate: 1 USD = {USD_TO_AED} AED</p>
        </div>
        <CurrencyToggle />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-sm font-medium">Connections</h2>
        <Status ok={source !== "csv"} label="Google Sheet" on="Connected — showing your real numbers" off="Not connected — showing sample numbers" />
        <Status ok={geminiConfigured()} label="Gemini (statement reading)" on="On" off="Off — add GEMINI_API_KEY in Vercel" />
        {source === "csv" || !geminiConfigured() ? (
          <p className="text-xs text-muted">The step-by-step setup guide is in the project on GitHub: docs/SETUP.md.</p>
        ) : null}
      </Card>
      <form action={logout}>
        <button
          type="submit"
          className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-down transition-colors duration-200 hover:bg-down-soft"
        >
          <LogOut aria-hidden size={16} /> Sign out
        </button>
      </form>
      <p className="text-center text-xs text-subtle">To sign out every device, change SESSION_SECRET and redeploy.</p>
    </div>
  );
}

function Status({ ok, label, on, off }: { ok: boolean; label: string; on: string; off: string }) {
  const Icon = ok ? CircleCheck : CircleDashed;
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden size={18} className={`mt-0.5 shrink-0 ${ok ? "text-up" : "text-muted"}`} />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted">{ok ? on : off}</p>
      </div>
    </div>
  );
}
