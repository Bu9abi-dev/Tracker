import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { getDataSource } from "@/lib/data";
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
      <Card className="space-y-1">
        <h2 className="text-sm font-medium">Data source</h2>
        <p className="text-sm text-muted">{source === "csv" ? "CSV files in /data (Phase 1, read-only)" : "Google Sheet via Apps Script (live)"}</p>
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
