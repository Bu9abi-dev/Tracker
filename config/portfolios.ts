/**
 * Portfolio registry.
 *
 * Portfolios come from two places:
 *   1. DEFAULT_PORTFOLIOS below (used as-is in CSV mode, and as the base in Sheet mode).
 *   2. The "Portfolios" tab in the Google Sheet, where portfolios added from the
 *      app are stored. Sheet rows are merged over the defaults.
 *
 * Hard rule: managed money (portfolios you look after for someone else, like P2)
 * is never part of the combined "Personal" view.
 *   - A portfolio is managed if its default says so (ALWAYS_MANAGED — a sheet edit
 *     can't change that) or if it was created as managed. The app has no control
 *     to switch a portfolio from managed to personal.
 *   - Personal = portfolios that are personal AND active AND opted in. Managed
 *     portfolios are excluded no matter what the "In Personal" cell says.
 *   - Tests check that no managed portfolio reaches any Personal number,
 *     including holdings and sector allocation.
 */

export type PortfolioStatus = "active" | "planned" | "archived";
export type Ownership = "personal" | "managed";

export interface PortfolioConfig {
  id: string;
  name: string;
  /** Short label for chips and legends. */
  shortName: string;
  description: string;
  status: PortfolioStatus;
  ownership: Ownership;
  /** Counted in Personal. Always false for managed portfolios. */
  includeInPersonal: boolean;
  /** Who the money belongs to, for managed portfolios. */
  managedFor?: string;
  /** Tab name in the Google Sheet. */
  tab: string;
  /** Sample-data file in /data (CSV mode only). */
  csv?: string;
  /** Chart colour token (CSS variable). Never green/red — those mean P&L. */
  color: string;
  note?: string;
  /** Broker + last 4 digits of the account, used to catch statements uploaded to the wrong portfolio. */
  accountHint?: string;
}

export const DEFAULT_PORTFOLIOS: readonly PortfolioConfig[] = [
  {
    id: "P1",
    name: "Flexible / Active Trading",
    shortName: "Active",
    description: "Stocks on IBKR",
    status: "active",
    ownership: "personal",
    includeInPersonal: true,
    tab: "P1 (STOCKS ONLY IBKR)",
    csv: "p1.csv",
    color: "--chart-1",
    note: "P5 Retirement was merged into this portfolio in Aug 2026.",
  },
  {
    id: "P2",
    name: "Mother's House Portfolio",
    shortName: "Mother's House",
    description: "Managed for my mother — not my money",
    status: "active",
    ownership: "managed",
    includeInPersonal: false,
    managedFor: "Mother",
    tab: "P2 HOUSE",
    csv: "p2.csv",
    color: "--chart-3",
  },
  {
    id: "P3",
    name: "Crypto DCA",
    shortName: "Crypto",
    description: "Crypto on OKX",
    status: "active",
    ownership: "personal",
    includeInPersonal: true,
    tab: "P3 Crypto (OKX)",
    csv: "p3.csv",
    color: "--chart-2",
  },
  {
    id: "P4",
    name: "Real Estate",
    shortName: "Real Estate",
    description: "Planned — not active yet",
    status: "planned",
    ownership: "personal",
    includeInPersonal: false,
    tab: "P4",
    csv: "p4.csv",
    color: "--chart-4",
  },
  {
    id: "P5",
    name: "Retirement",
    shortName: "Retirement",
    description: "Archived — merged into P1 in Aug 2026",
    status: "archived",
    ownership: "personal",
    includeInPersonal: false,
    tab: "P5",
    csv: "p5.csv",
    color: "--chart-5",
  },
];

/** Ids that are managed money forever, whatever the sheet says. */
export const ALWAYS_MANAGED: ReadonlySet<string> = new Set(DEFAULT_PORTFOLIOS.filter((p) => p.ownership === "managed").map((p) => p.id));

export const PALETTE = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6", "--chart-7", "--chart-8"] as const;

/** A row of the sheet's "Portfolios" tab (values as typed by a person). */
export interface RegistryRow {
  id?: unknown;
  name?: unknown;
  shortName?: unknown;
  description?: unknown;
  status?: unknown;
  ownership?: unknown;
  includeInPersonal?: unknown;
  managedFor?: unknown;
  tab?: unknown;
  color?: unknown;
  accountHint?: unknown;
}

export interface Registry {
  list: PortfolioConfig[];
  /** Ids in the combined Personal view. */
  personalIds: string[];
  /** Problems found while reading the Portfolios tab (shown in Data issues). */
  issues: string[];
}

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,12}$/;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  const s = str(v).toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return undefined;
}

export function isPersonal(p: PortfolioConfig): boolean {
  return p.ownership === "personal" && p.status === "active" && p.includeInPersonal;
}

/** Merge sheet rows over the defaults and apply the hard rules. */
export function buildRegistry(rows: readonly RegistryRow[] = [], defaults: readonly PortfolioConfig[] = DEFAULT_PORTFOLIOS): Registry {
  const issues: string[] = [];
  const byId = new Map<string, PortfolioConfig>(defaults.map((p) => [p.id, { ...p }]));
  const order = defaults.map((p) => p.id);

  for (const row of rows) {
    const id = str(row.id).toUpperCase();
    if (!id) continue;
    if (!ID_PATTERN.test(id)) {
      issues.push(`Portfolios tab: "${str(row.id)}" isn't a valid id (letters, numbers, - or _, up to 12)`);
      continue;
    }
    const base = byId.get(id);
    const statusRaw = str(row.status).toLowerCase();
    const status: PortfolioStatus | undefined =
      statusRaw === "active" || statusRaw === "planned" || statusRaw === "archived" ? statusRaw : undefined;
    if (statusRaw && !status) issues.push(`${id}: status "${str(row.status)}" should be active, planned or archived`);
    const ownershipRaw = str(row.ownership).toLowerCase();
    const sheetSaysManaged = ownershipRaw.startsWith("managed");
    const managed = ALWAYS_MANAGED.has(id) || base?.ownership === "managed" || sheetSaysManaged;
    if (managed && ownershipRaw && !sheetSaysManaged) {
      issues.push(`${id} is managed money and stays out of Personal (the sheet says "${str(row.ownership)}")`);
    }

    const name = str(row.name) || base?.name || id;
    const merged: PortfolioConfig = {
      id,
      name,
      shortName: str(row.shortName) || base?.shortName || name,
      description: str(row.description) || base?.description || "",
      status: status ?? base?.status ?? "active",
      ownership: managed ? "managed" : "personal",
      includeInPersonal: false,
      managedFor: managed ? str(row.managedFor) || base?.managedFor || "someone else" : undefined,
      tab: str(row.tab) || base?.tab || id,
      csv: base?.csv,
      color: /^--chart-\d$/.test(str(row.color)) ? str(row.color) : (base?.color ?? PALETTE[order.length % PALETTE.length]!),
      note: base?.note,
      accountHint: str(row.accountHint) || base?.accountHint || undefined,
    };
    const wantsPersonal = bool(row.includeInPersonal) ?? base?.includeInPersonal ?? false;
    if (merged.ownership === "personal") merged.includeInPersonal = wantsPersonal;
    else if (bool(row.includeInPersonal)) issues.push(`${id} is managed money — "In Personal" is ignored`);
    if (merged.includeInPersonal && merged.status !== "active") issues.push(`${id} is ${merged.status}, so it isn't counted in Personal`);
    byId.set(id, merged);
    if (!order.includes(id)) order.push(id);
  }

  const list = order.map((id) => byId.get(id)!);
  for (const p of list) if (p.ownership === "managed") p.includeInPersonal = false;
  return { list, personalIds: list.filter(isPersonal).map((p) => p.id), issues };
}

export function findPortfolio(registry: Registry, id: string): PortfolioConfig | undefined {
  const key = id.toUpperCase();
  return registry.list.find((p) => p.id === key);
}

/** Next free id like "P6". */
export function nextPortfolioId(registry: Registry): string {
  const n = registry.list.map((p) => /^P(\d+)$/.exec(p.id)?.[1]).filter(Boolean).map(Number);
  return `P${(n.length ? Math.max(...n) : 0) + 1}`;
}

/** Defaults-only registry (CSV mode and tests). */
export const DEFAULT_REGISTRY: Registry = buildRegistry();
