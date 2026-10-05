import type { Currency } from "./calculations";

export const CURRENCY_COOKIE = "tracker_currency";
export const THEME_COOKIE = "tracker_theme";
export type Theme = "system" | "light" | "dark";

export function parseCurrency(v: string | undefined): Currency {
  return v === "AED" ? "AED" : "USD";
}

export function parseTheme(v: string | undefined): Theme {
  return v === "light" || v === "dark" ? v : "system";
}

/** Client-side: persist a preference for a year (not sensitive, readable by JS). */
export function setPreferenceCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
