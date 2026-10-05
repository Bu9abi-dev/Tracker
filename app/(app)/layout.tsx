import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { CurrencyToggle } from "@/components/currency";
import { BottomNav, SettingsLink, TopNav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <>
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              Portfolio
            </Link>
            <TopNav />
          </div>
          <div className="flex items-center gap-1.5">
            <CurrencyToggle />
            <SettingsLink />
          </div>
        </div>
      </header>
      <main className="main-inset mx-auto max-w-5xl px-4 pt-6">{children}</main>
      <BottomNav />
    </>
  );
}
