import type { PortfolioId } from "@/config/portfolios";
import { buildPeriods, toSeries } from "@/lib/calculations";
import type { DataIssue, PortfolioData, RawRow, Snapshot } from "./types";

/** Excel/Sheets serial day 0. Serial 45658 = 2025-01-01. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Moves bigger than this in one period (market-only) are flagged for review. */
export const SUSPICIOUS_MOVE = 0.5;
/** Capital changes bigger than this share of the prior value (and $1,000) without a note are flagged. */
export const LARGE_FLOW_SHARE = 0.2;
export const LARGE_FLOW_MIN = 1000;

export type ParsedNumber = { ok: true; value: number } | { ok: false; reason: string };

/** "21,450.32 USD", "$1,000", "(250)", " 12 000 " → number. Blank → error. */
export function parseNumber(raw: unknown): ParsedNumber {
  if (typeof raw === "number") return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, reason: "not a number" };
  if (typeof raw !== "string") return { ok: false, reason: "missing" };
  let s = raw.trim();
  if (s === "") return { ok: false, reason: "missing" };
  if (/\baed\b|د\.إ/i.test(s)) return { ok: false, reason: `"${raw}" looks like AED — this column must be USD` };
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\b(usd|us\$)\b/gi, "").replace(/[$,\s ']/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, reason: `"${raw}" is not a number` };
  const n = Number(s);
  return { ok: true, value: negative ? -n : n };
}

function iso(y: number, m: number, d: number): string | null {
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  return new Date(EXCEL_EPOCH_MS + Math.floor(serial) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Accepted date formats (calendar dates, no time zone):
 *   - Excel/Sheets serial numbers (number or numeric string), e.g. 45660
 *   - ISO: 2025-01-03 (an optional time part is ignored)
 *   - Day first, as used in the UAE: 03/01/2025, 3-1-2025, 03.01.2025
 *   - 03 Jan 2025, 3 January 2025
 */
export function parseDate(raw: unknown): string | null {
  if (typeof raw === "number") return excelSerialToIso(raw);
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n >= 20000 && n <= 80000 ? excelSerialToIso(n) : null;
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})[\s-]([a-z]{3,9})[\s,-]*(\d{4})$/i.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
    if (month >= 0) return iso(+m[3]!, month + 1, +m[1]!);
  }
  return null;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * Clean raw rows into sorted snapshots. Nothing is dropped silently:
 * every skipped or suspicious row produces a DataIssue.
 * @param today YYYY-MM-DD in the user's time zone; later dates are rejected.
 */
export function cleanRows(portfolioId: PortfolioId, rows: readonly RawRow[], today: string): PortfolioData {
  const issues: DataIssue[] = [];
  const add = (i: Omit<DataIssue, "portfolioId">) => issues.push({ portfolioId, ...i });
  const parsed: (Snapshot & { row: number })[] = [];

  for (const r of rows) {
    if (isBlank(r.date) && isBlank(r.invested) && isBlank(r.value) && isBlank(r.notes)) continue;
    const notes = isBlank(r.notes) ? "" : String(r.notes).trim();

    if (isBlank(r.date)) {
      add({ row: r.row, severity: "warning", action: "skipped", message: `Missing date${notes ? ` (note: "${notes}")` : ""}` });
      continue;
    }
    const date = parseDate(r.date);
    if (!date) {
      add({ row: r.row, severity: "error", action: "skipped", message: `Unrecognised date "${String(r.date)}"` });
      continue;
    }
    if (date > today) {
      add({ row: r.row, date, severity: "error", action: "skipped", message: "Date is in the future" });
      continue;
    }
    const invested = parseNumber(r.invested);
    const value = parseNumber(r.value);
    if (!invested.ok || !value.ok) {
      const parts = [!invested.ok && `Invested ${invested.reason}`, !value.ok && `Value ${value.reason}`].filter(Boolean);
      add({ row: r.row, date, severity: "error", action: "skipped", message: parts.join("; ") });
      continue;
    }
    if (value.value < 0) {
      add({ row: r.row, date, severity: "error", action: "skipped", message: "Value is negative" });
      continue;
    }
    if (invested.value < 0) {
      add({ row: r.row, date, severity: "warning", action: "kept", message: "Invested is negative (withdrawn more than deposited)" });
    }
    if (value.value === 0 && invested.value > 0) {
      add({ row: r.row, date, severity: "warning", action: "kept", message: "Value is 0 while invested capital is positive" });
    }
    parsed.push({ date, invested: invested.value, value: value.value, notes, row: r.row });
  }

  // Order & duplicates.
  const outOfOrder = parsed.some((p, i) => i > 0 && p.date < parsed[i - 1]!.date);
  if (outOfOrder) add({ severity: "info", action: "kept", message: "Rows were out of date order and have been sorted" });
  const sorted = [...parsed].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row));
  const byDate = new Map<string, Snapshot & { row: number }>();
  for (const p of sorted) {
    const prev = byDate.get(p.date);
    if (prev) {
      const same = prev.invested === p.invested && prev.value === p.value;
      add({
        row: prev.row,
        date: p.date,
        severity: same ? "info" : "warning",
        action: "skipped",
        message: same
          ? `Duplicate of row ${p.row}; kept one copy`
          : `Two rows for this date with different numbers; using the later row ${p.row}`,
      });
      if (!p.notes && prev.notes) p.notes = prev.notes;
    }
    byDate.set(p.date, p);
  }
  const snapshots: Snapshot[] = [...byDate.values()].map(({ row: _row, ...s }) => s);
  const rowOf = new Map([...byDate.values()].map((p) => [p.date, p.row]));

  // Checks that need consecutive snapshots.
  const series = toSeries(snapshots);
  buildPeriods(series).forEach((p, i) => {
    const point = series[i + 1]!;
    const row = rowOf.get(p.endDate);
    if (p.return !== null && Math.abs(p.return) > SUSPICIOUS_MOVE) {
      add({
        row,
        date: p.endDate,
        severity: "warning",
        action: "kept",
        message: `Market move of ${(p.return * 100).toFixed(0)}% in one period — check for a typo or a missing deposit`,
      });
    }
    if (p.return === null) {
      add({ row, date: p.endDate, severity: "warning", action: "kept", message: "Return can't be measured for this period (no capital at risk); TWR skips it" });
    }
    if (!point.notes && Math.abs(p.flow) >= LARGE_FLOW_MIN && Math.abs(p.flow) > LARGE_FLOW_SHARE * p.startValue) {
      add({
        row,
        date: p.endDate,
        severity: "warning",
        action: "kept",
        message: `Invested changed by ${p.flow > 0 ? "+" : "−"}$${Math.abs(p.flow).toLocaleString("en-US")} with no note — deposit, withdrawal or typo?`,
      });
    }
  });

  return { portfolioId, snapshots, issues };
}
