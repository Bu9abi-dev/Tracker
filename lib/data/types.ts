import type { Registry, RegistryRow } from "@/config/portfolios";

/** One cleaned snapshot row. All money in USD. `date` is a calendar date, YYYY-MM-DD. */
export interface Snapshot {
  date: string;
  invested: number;
  value: number;
  notes: string;
}

/** Raw row as it comes from a CSV file or the Apps Script JSON (strings or numbers). */
export interface RawRow {
  date: unknown;
  invested: unknown;
  value: unknown;
  notes: unknown;
  /** 1-based row number in the source, for issue messages. */
  row: number;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface DataIssue {
  portfolioId: string;
  /** Source row number, when the issue maps to a row. */
  row?: number;
  date?: string;
  severity: IssueSeverity;
  /** "skipped" = row not used in any calculation; "kept" = used but worth a look. */
  action: "skipped" | "kept";
  message: string;
}

export interface PortfolioData {
  portfolioId: string;
  snapshots: Snapshot[];
  issues: DataIssue[];
}

export interface NewEntry {
  /** Client-generated id so a double tap or retry doesn't add the row twice. */
  id: string;
  portfolioId: string;
  date: string;
  invested: number;
  value: number;
  notes: string;
}

// --- Holdings ---------------------------------------------------------------

/** Fixed sector list (GICS sectors plus a few buckets for non-stocks). */
export const SECTORS = [
  "Information Technology",
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Health Care",
  "Financials",
  "Industrials",
  "Energy",
  "Materials",
  "Utilities",
  "Real Estate",
  "Diversified (ETF/Fund)",
  "Bonds",
  "Crypto",
  "Cash",
  "Other",
] as const;
export type Sector = (typeof SECTORS)[number];

export const ASSET_TYPES = ["stock", "etf", "fund", "bond", "crypto", "cash", "option", "other"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** One position from a statement. Money in USD. */
export interface Holding {
  symbol: string;
  name: string;
  assetType: AssetType;
  sector: Sector;
  quantity: number | null;
  priceUsd: number | null;
  valueUsd: number;
  /** Total cost of the position; null when the statement doesn't show it. */
  costBasisUsd: number | null;
}

export interface StatementMeta {
  id: string;
  portfolioId: string;
  /** Date the statement is "as of" (YYYY-MM-DD). */
  statementDate: string;
  /** When it was confirmed in the app (ISO timestamp). */
  savedAt: string;
  fileName: string;
  broker: string;
  /** e.g. "IBKR …1234" */
  accountHint: string;
  /** Total value reported on the statement (USD), if shown. */
  reportedTotalUsd: number | null;
}

export interface Statement extends StatementMeta {
  holdings: Holding[];
}

export interface NewPortfolio {
  id: string;
  name: string;
  shortName: string;
  description: string;
  status: "active" | "planned";
  ownership: "personal" | "managed";
  includeInPersonal: boolean;
  managedFor: string;
  color: string;
}

// --- Loading ----------------------------------------------------------------

export interface RawLoad {
  rows: Record<string, RawRow[]>;
  /** Rows of the sheet's Portfolios tab (Sheet mode). */
  registry?: RegistryRow[];
  statements?: unknown[];
  holdings?: unknown[];
  fetchedAt: string;
  staleReason?: string;
}

export interface LoadResult {
  registry: Registry;
  /** Problems in the Sheet's Portfolios tab. */
  registryIssues: DataIssue[];
  data: Record<string, PortfolioData>;
  /** Latest confirmed statement per portfolio id. */
  statements: Record<string, Statement>;
  fetchedAt: string;
  staleReason?: string;
  /** Which source served the data ("csv" or "apps-script"). */
  source: string;
}

/**
 * Swappable data layer. Phase 1 = CSV files, Phase 2 = Google Sheet via Apps Script.
 * A database-backed source only needs to implement these methods.
 */
export interface DataSource {
  readonly kind: string;
  /** Whether this source can save entries, portfolios and statements. */
  readonly writable: boolean;
  loadRaw(): Promise<RawLoad>;
  addEntry(entry: NewEntry): Promise<void>;
  createPortfolio(p: NewPortfolio, tab: string): Promise<void>;
  saveStatement(s: Statement): Promise<void>;
}
