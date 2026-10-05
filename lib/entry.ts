import { PORTFOLIOS, type PortfolioId } from "@/config/portfolios";
import { parseDate, parseNumber } from "./data/clean";
import type { NewEntry } from "./data/types";

export const MAX_NOTES = 500;

/** Portfolios you can add snapshots to (active ones). */
export const WRITABLE_IDS = PORTFOLIOS.filter((p) => p.status === "active").map((p) => p.id) as PortfolioId[];

export type EntryErrors = Partial<Record<"id" | "date" | "portfolioId" | "invested" | "value" | "notes", string>>;

export type ValidationResult = { ok: true; entry: NewEntry } | { ok: false; errors: EntryErrors };

/** Validate the Add form (runs on both client and server). Numbers may contain "USD", "$" and commas. */
export function validateEntry(input: Record<string, unknown>, today: string): ValidationResult {
  const errors: EntryErrors = {};
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!/^[\w-]{8,64}$/.test(id)) errors.id = "Missing submission id — reload the page.";

  const date = parseDate(typeof input.date === "string" ? input.date : "");
  if (!date) errors.date = "Enter a valid date.";
  else if (date > today) errors.date = "Date can't be in the future.";

  const portfolioId = String(input.portfolioId ?? "");
  if (!(WRITABLE_IDS as string[]).includes(portfolioId)) errors.portfolioId = "Choose an active portfolio.";

  const invested = parseNumber(typeof input.invested === "string" ? input.invested : input.invested ?? "");
  if (!invested.ok) errors.invested = "Enter invested capital as a number (USD).";

  const value = parseNumber(typeof input.value === "string" ? input.value : input.value ?? "");
  if (!value.ok) errors.value = "Enter the current value as a number (USD).";
  else if (value.value < 0) errors.value = "Value can't be negative.";

  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > MAX_NOTES) errors.notes = `Keep notes under ${MAX_NOTES} characters.`;

  if (Object.keys(errors).length || !date || !invested.ok || !value.ok) return { ok: false, errors };
  return {
    ok: true,
    entry: {
      id,
      portfolioId: portfolioId as PortfolioId,
      date,
      invested: Math.round(invested.value * 100) / 100,
      value: Math.round(value.value * 100) / 100,
      notes,
    },
  };
}
