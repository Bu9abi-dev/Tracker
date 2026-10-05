"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, setPreferenceCookie, type Theme } from "@/lib/preferences";

const OPTIONS = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const choose = (t: Theme) => {
    setTheme(t);
    setPreferenceCookie(THEME_COOKIE, t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          className={`flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border text-sm font-medium transition-colors duration-200 ${
            theme === value ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg"
          }`}
        >
          <Icon aria-hidden size={18} />
          {label}
        </button>
      ))}
    </div>
  );
}
