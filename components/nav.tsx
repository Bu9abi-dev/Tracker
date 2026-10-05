"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CirclePlus, FileUp, House, Layers, Settings } from "lucide-react";

const TABS = [
  { href: "/", label: "Overview", icon: House, match: (p: string) => p === "/" },
  { href: "/portfolios", label: "Portfolios", icon: Layers, match: (p: string) => p.startsWith("/portfolios") || p.startsWith("/p/") },
  { href: "/add", label: "Add", icon: CirclePlus, match: (p: string) => p.startsWith("/add") },
  { href: "/upload", label: "Upload", icon: FileUp, match: (p: string) => p.startsWith("/upload") },
  { href: "/journal", label: "Journal", icon: BookOpen, match: (p: string) => p.startsWith("/journal") },
] as const;

/** Fixed bottom tab bar on phones (≤ 5 tabs, 44pt+ targets, safe-area aware). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-md md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-200 ${
                  active ? "text-accent" : "text-muted hover:text-fg"
                }`}
              >
                <Icon aria-hidden size={22} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Inline tabs in the header on tablet/desktop. */
export function TopNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {TABS.map(({ href, label, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors duration-200 ${
                  active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsLink() {
  const active = usePathname().startsWith("/settings");
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      aria-current={active ? "page" : undefined}
      className={`inline-flex size-10 items-center justify-center rounded-full transition-colors duration-200 hover:bg-surface-2 ${active ? "text-fg" : "text-muted"}`}
    >
      <Settings aria-hidden size={20} />
    </Link>
  );
}
