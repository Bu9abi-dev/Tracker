import { USD_TO_AED } from "./calculations";
import { parseDate } from "./data/clean";
import { ASSET_TYPES, SECTORS, type AssetType, type Holding, type Sector, type Statement } from "./data/types";

/** Row-level value check: |quantity × price − value| must be within this share of value (or $1). */
export const ROW_TOLERANCE = 0.01;
/** Holdings must add up to the statement's reported total within this share (or $1). */
export const TOTAL_TOLERANCE = 0.005;

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[,$\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
/** Text from a Sheet cell. A leading apostrophe (Sheets' "keep as text" marker) is dropped. */
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().replace(/^'/, ""));

export function normalizeSector(v: unknown): Sector {
  const s = str(v).toLowerCase();
  if (!s) return "Other";
  const exact = SECTORS.find((x) => x.toLowerCase() === s);
  if (exact) return exact;
  if (/tech|software|semi/.test(s)) return "Information Technology";
  if (/communication|media|telecom/.test(s)) return "Communication Services";
  if (/discretionary|retail|auto/.test(s)) return "Consumer Discretionary";
  if (/staple|beverage|food/.test(s)) return "Consumer Staples";
  if (/health|pharma|biotech|medical/.test(s)) return "Health Care";
  if (/financ|bank|insur/.test(s)) return "Financials";
  if (/industr/.test(s)) return "Industrials";
  if (/energy|oil/.test(s)) return "Energy";
  if (/material|mining|metal|chemic/.test(s)) return "Materials";
  if (/utilit/.test(s)) return "Utilities";
  if (/real estate|reit/.test(s)) return "Real Estate";
  if (/etf|fund|index|diversified/.test(s)) return "Diversified (ETF/Fund)";
  if (/bond|treasur|fixed income/.test(s)) return "Bonds";
  if (/crypto|bitcoin|ethereum|token|coin/.test(s)) return "Crypto";
  if (/cash|money market/.test(s)) return "Cash";
  return "Other";
}

export function normalizeAssetType(v: unknown): AssetType {
  const s = str(v).toLowerCase();
  return (ASSET_TYPES as readonly string[]).includes(s) ? (s as AssetType) : "other";
}

/** Rebuild statements (with their holdings) from the Sheet's Statements and Holdings tabs. */
export function parseStatements(rawStatements: readonly unknown[] = [], rawHoldings: readonly unknown[] = []): Statement[] {
  const holdingsBy = new Map<string, Holding[]>();
  for (const h of rawHoldings as Record<string, unknown>[]) {
    const statementId = str(h?.statementId);
    const valueUsd = num(h?.valueUsd);
    if (!statementId || valueUsd === null) continue;
    const list = holdingsBy.get(statementId) ?? [];
    list.push({
      symbol: str(h.symbol),
      name: str(h.name),
      assetType: normalizeAssetType(h.assetType),
      sector: normalizeSector(h.sector),
      quantity: num(h.quantity),
      priceUsd: num(h.priceUsd),
      valueUsd,
      costBasisUsd: num(h.costBasisUsd),
    });
    holdingsBy.set(statementId, list);
  }
  const out: Statement[] = [];
  for (const s of rawStatements as Record<string, unknown>[]) {
    const id = str(s?.id);
    const portfolioId = str(s?.portfolioId).toUpperCase();
    const statementDate = parseDate(str(s?.statementDate));
    if (!id || !portfolioId || !statementDate) continue;
    out.push({
      id,
      portfolioId,
      statementDate,
      savedAt: str(s.savedAt),
      fileName: str(s.fileName),
      broker: str(s.broker),
      accountHint: str(s.accountHint),
      reportedTotalUsd: num(s.reportedTotalUsd),
      holdings: holdingsBy.get(id) ?? [],
    });
  }
  return out;
}

/** The latest statement per portfolio (by statement date, then save time). */
export function latestStatements(list: readonly Statement[]): Record<string, Statement> {
  const out: Record<string, Statement> = {};
  for (const s of list) {
    const cur = out[s.portfolioId];
    if (!cur || s.statementDate > cur.statementDate || (s.statementDate === cur.statementDate && s.savedAt > cur.savedAt)) {
      out[s.portfolioId] = s;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Extraction draft (what the AI returns, after the person edits it)
// ---------------------------------------------------------------------------

export interface DraftHolding {
  symbol: string;
  name: string;
  assetType: AssetType;
  sector: Sector;
  quantity: number | null;
  price: number | null;
  value: number;
  costBasis: number | null;
  /** Set when the person ticked "I checked this row against my statement". */
  checked?: boolean;
}

export interface Draft {
  broker: string;
  accountLast4: string;
  accountHolder: string;
  statementDate: string;
  /** Currency the statement's numbers are in. USD and AED are supported. */
  currency: string;
  reportedTotal: number | null;
  holdings: DraftHolding[];
  warnings: string[];
  /** Set when the person ticked "The total is right" despite a mismatch. */
  totalChecked?: boolean;
}

export interface DraftCheck {
  /** Row index → problem; Confirm stays disabled while any row problem is unchecked. */
  rowProblems: Record<number, string>;
  totalProblem: string | null;
  /** Problems that can't be ticked away (must be fixed). */
  blocking: string[];
  holdingsTotal: number;
  /** True when it's safe to save. */
  ok: boolean;
}

export function checkDraft(d: Draft, today: string): DraftCheck {
  const blocking: string[] = [];
  const rowProblems: Record<number, string> = {};
  const currency = d.currency.toUpperCase();
  if (currency !== "USD" && currency !== "AED") blocking.push(`Statement currency ${d.currency || "(unknown)"} isn't supported yet — only USD and AED.`);
  const date = parseDate(d.statementDate);
  if (!date) blocking.push("Statement date is missing — enter it.");
  else if (date > today) blocking.push("Statement date is in the future.");
  if (d.holdings.length === 0) blocking.push("No holdings found.");

  let total = 0;
  d.holdings.forEach((h, i) => {
    if (!Number.isFinite(h.value) || h.value < 0) {
      blocking.push(`Row ${i + 1} (${h.symbol || "unnamed"}): value must be a positive number.`);
      return;
    }
    total += h.value;
    if (!h.symbol && !h.name) blocking.push(`Row ${i + 1}: needs a symbol or name.`);
    if (h.quantity !== null && h.price !== null && h.assetType !== "cash" && h.assetType !== "option") {
      const expected = h.quantity * h.price;
      if (Math.abs(expected - h.value) > Math.max(1, ROW_TOLERANCE * h.value)) {
        rowProblems[i] = `Quantity × price = ${expected.toFixed(2)}, but value says ${h.value.toFixed(2)}`;
      }
    }
    if (h.costBasis !== null && (!Number.isFinite(h.costBasis) || h.costBasis < 0)) blocking.push(`Row ${i + 1}: cost must be a positive number or empty.`);
  });

  let totalProblem: string | null = null;
  if (d.reportedTotal !== null && Math.abs(total - d.reportedTotal) > Math.max(1, TOTAL_TOLERANCE * d.reportedTotal)) {
    totalProblem = `Holdings add up to ${total.toFixed(2)}, but the statement total is ${d.reportedTotal.toFixed(2)}`;
  }
  const rowsOk = Object.keys(rowProblems).every((k) => d.holdings[Number(k)]?.checked);
  const ok = blocking.length === 0 && rowsOk && (!totalProblem || !!d.totalChecked);
  return { rowProblems, totalProblem, blocking, holdingsTotal: total, ok };
}

/** Converts a checked draft into a Statement in USD. */
export function draftToStatement(
  d: Draft,
  meta: { id: string; portfolioId: string; fileName: string; savedAt: string },
): Statement {
  const rate = d.currency.toUpperCase() === "AED" ? 1 / USD_TO_AED : 1;
  const usd = (n: number | null) => (n === null ? null : Math.round(n * rate * 100) / 100);
  return {
    id: meta.id,
    portfolioId: meta.portfolioId,
    statementDate: parseDate(d.statementDate) ?? d.statementDate,
    savedAt: meta.savedAt,
    fileName: meta.fileName,
    broker: d.broker,
    accountHint: accountHint(d.broker, d.accountLast4),
    reportedTotalUsd: usd(d.reportedTotal),
    holdings: d.holdings.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      assetType: h.assetType,
      sector: h.sector,
      quantity: h.quantity,
      priceUsd: usd(h.price),
      valueUsd: usd(h.value) ?? 0,
      costBasisUsd: usd(h.costBasis),
    })),
  };
}

export function accountHint(broker: string, last4: string): string {
  const digits = last4.replace(/\D/g, "").slice(-4);
  return [broker.trim(), digits ? `…${digits}` : ""].filter(Boolean).join(" ");
}

export interface IdentityCheck {
  /** The chosen portfolio's saved hint differs from this statement. */
  mismatch: string | null;
  /** Another portfolio's saved hint matches this statement. */
  looksLike: string | null;
}

/** Catch a statement uploaded to the wrong portfolio (e.g. Mother's statement into P1). */
export function checkIdentity(
  hint: string,
  chosen: { id: string; accountHint?: string },
  others: readonly { id: string; name: string; accountHint?: string }[],
): IdentityCheck {
  const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const h = norm(hint);
  const last4 = (s?: string) => /(\d{4})\D*$/.exec(s ?? "")?.[1];
  const same = (a?: string) => !!a && (norm(a) === h || (!!last4(a) && last4(a) === last4(hint)));
  const other = h ? others.find((o) => o.id !== chosen.id && same(o.accountHint)) : undefined;
  const mismatch = chosen.accountHint && h && !same(chosen.accountHint) ? `This portfolio's statements usually come from ${chosen.accountHint}, but this one is ${hint}.` : null;
  return { mismatch, looksLike: other ? `This statement looks like it belongs to ${other.id} · ${other.name} (${other.accountHint}).` : null };
}
