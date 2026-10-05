import type { PortfolioId } from "@/config/portfolios";

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
  /** 1-based row number in the source (header = row 1), for issue messages. */
  row: number;
}

export type IssueSeverity = "error" | "warning" | "info";

export interface DataIssue {
  portfolioId: PortfolioId;
  /** Source row number, when the issue maps to a row. */
  row?: number;
  date?: string;
  severity: IssueSeverity;
  /** "skipped" = row not used in any calculation; "kept" = used but worth a look. */
  action: "skipped" | "kept";
  message: string;
}

export interface PortfolioData {
  portfolioId: PortfolioId;
  snapshots: Snapshot[];
  issues: DataIssue[];
}

export interface NewEntry {
  /** Client-generated id so a double tap or retry doesn't add the row twice. */
  id: string;
  portfolioId: PortfolioId;
  date: string;
  invested: number;
  value: number;
  notes: string;
}

export interface LoadResult {
  portfolios: Partial<Record<PortfolioId, PortfolioData>>;
  /** When the source data was fetched (ISO timestamp). */
  fetchedAt: string;
  /** Set when live data failed and we're showing the last good copy. */
  staleReason?: string;
}

/**
 * Swappable data layer. Phase 1 = CSV files, Phase 2 = Google Apps Script.
 * A database-backed source only needs to implement these two methods.
 */
export interface DataSource {
  readonly kind: string;
  /** Raw rows per portfolio id. Cleaning happens in one place (clean.ts), not in sources. */
  loadRaw(): Promise<{ rows: Partial<Record<PortfolioId, RawRow[]>>; fetchedAt: string; staleReason?: string }>;
  addEntry(entry: NewEntry): Promise<void>;
}
