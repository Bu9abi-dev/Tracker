import { convert, type Currency } from "./calculations";

/** Times are shown in this zone, 12-hour clock. Dates are calendar dates and never shift. */
export const TIME_ZONE = "Asia/Dubai";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-01-03" → "03 Jan 2025". */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  const month = MONTHS[Number(m) - 1];
  if (!y || !month || !d) return isoDate;
  return `${d.padStart(2, "0")} ${month} ${y}`;
}

/** "2025-01-03" → "03 Jan" (chart axes). */
export function formatShortDate(isoDate: string): string {
  return formatDate(isoDate).slice(0, 6);
}

/** "2025-01-03" → "Jan 25" (chart axes over long ranges). */
export function formatMonthYear(isoDate: string): string {
  const [y, m] = isoDate.split("-");
  return `${MONTHS[Number(m) - 1] ?? ""} ${y?.slice(2) ?? ""}`;
}

/** ISO timestamp → "3:45 PM" (12-hour). */
export function formatTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(new Date(isoTimestamp));
}

/** ISO timestamp → "05 Oct 2026, 3:45 PM". */
export function formatDateTime(isoTimestamp: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(isoTimestamp),
  );
  return `${formatDate(parts)}, ${formatTime(isoTimestamp)}`;
}

/** Today's calendar date in TIME_ZONE as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface MoneyOptions {
  /** Prefix + for positive values (for P&L and changes). */
  signed?: boolean;
  /** Decimal places. Defaults to 0. */
  decimals?: number;
  /** 12.3K / 1.2M — for chart axes. */
  compact?: boolean;
}

/** Format a USD amount in the chosen display currency. */
export function formatMoney(usd: number, currency: Currency, opts: MoneyOptions = {}): string {
  return formatAmount(convert(usd, currency), currency, opts);
}

/** Format an amount that is already in `currency` (e.g. a converted chart value). */
export function formatAmount(amount: number, currency: Currency, { signed = false, decimals = 0, compact = false }: MoneyOptions = {}): string {
  const abs = Math.abs(amount);
  const body = compact
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: abs >= 1e6 ? 2 : 1 }).format(abs)
    : abs.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const rounded = Number(abs.toFixed(compact ? 1 : decimals));
  const sign = amount < 0 && rounded !== 0 ? "−" : signed && rounded !== 0 ? "+" : "";
  return currency === "USD" ? `${sign}$${body}` : `${sign}AED ${body}`;
}

/** 0.1234 → "+12.34%". */
export function formatPercent(ratio: number | null | undefined, { signed = true, decimals = 2 } = {}): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  const pct = ratio * 100;
  const rounded = Number(pct.toFixed(decimals));
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  return `${sign}${Math.abs(pct).toFixed(decimals)}%`;
}

/** P&L direction for colouring. Green/red are reserved for this. */
export function direction(n: number | null | undefined): "up" | "down" | "flat" {
  if (n === null || n === undefined || !Number.isFinite(n) || Math.abs(n) < 1e-9) return "flat";
  return n > 0 ? "up" : "down";
}
