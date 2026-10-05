/**
 * Portfolio registry. Add, rename or archive portfolios here.
 *
 * Hard rule: a portfolio with `ownership: "managed"` (money that is not yours,
 * e.g. P2) can never be part of the combined "Personal" view. This is enforced
 * three ways:
 *   1. Types — `includeInPersonal` is the literal `false` for managed portfolios,
 *      so setting it to `true` is a compile error.
 *   2. Runtime — `assertConfig()` throws at import time if the rule is broken.
 *   3. Tests — config.test.ts and calculations.test.ts check membership and
 *      that Personal results never change when P2 data changes.
 */

export type PortfolioStatus = "active" | "planned" | "archived";

interface PortfolioBase {
  id: string;
  name: string;
  /** Short label for tabs, chips and legends. */
  shortName: string;
  description: string;
  status: PortfolioStatus;
  /** Where the data lives: CSV file name in /data and sheet name in Google Sheets. */
  source: { csv: string; sheet: string };
  /** Chart colour token (CSS variable name). Never green/red — those mean P&L. */
  color: string;
  /** Free-form context shown on the portfolio page. */
  note?: string;
}

export interface PersonalPortfolio extends PortfolioBase {
  ownership: "personal";
  /** Counted in the combined Personal view. */
  includeInPersonal: boolean;
}

export interface ManagedPortfolio extends PortfolioBase {
  ownership: "managed";
  /** Managed money is never part of Personal. Literal `false` — `true` won't compile. */
  includeInPersonal: false;
  managedFor: string;
}

export type PortfolioConfig = PersonalPortfolio | ManagedPortfolio;

export const PORTFOLIOS = [
  {
    id: "P1",
    name: "Flexible / Active Trading",
    shortName: "Active",
    description: "Stocks on IBKR",
    status: "active",
    ownership: "personal",
    includeInPersonal: true,
    source: { csv: "p1.csv", sheet: "P1" },
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
    source: { csv: "p2.csv", sheet: "P2" },
    color: "--chart-3",
  },
  {
    id: "P3",
    name: "Crypto DCA",
    shortName: "Crypto",
    description: "Weekly DCA on OKX",
    status: "active",
    ownership: "personal",
    includeInPersonal: true,
    source: { csv: "p3.csv", sheet: "P3" },
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
    source: { csv: "p4.csv", sheet: "P4" },
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
    source: { csv: "p5.csv", sheet: "P5" },
    color: "--chart-5",
  },
] as const satisfies readonly PortfolioConfig[];

export type PortfolioId = (typeof PORTFOLIOS)[number]["id"];

/** Ids of portfolios in the combined Personal view, derived from config. */
type PersonalEntry = Extract<(typeof PORTFOLIOS)[number], { ownership: "personal"; includeInPersonal: true }>;
export type PersonalPortfolioId = PersonalEntry["id"];

export function assertConfig(list: readonly PortfolioConfig[] = PORTFOLIOS): void {
  const ids = new Set<string>();
  for (const p of list) {
    if (ids.has(p.id)) throw new Error(`Duplicate portfolio id ${p.id}`);
    ids.add(p.id);
    if (p.ownership === "managed" && (p.includeInPersonal as boolean)) {
      throw new Error(`${p.id} is managed money and can never be included in Personal`);
    }
    if (p.includeInPersonal && p.status !== "active") {
      throw new Error(`${p.id} is ${p.status}; only active portfolios can be in Personal`);
    }
  }
}
assertConfig();

export const PERSONAL_IDS: readonly PersonalPortfolioId[] = PORTFOLIOS.filter(
  (p): p is PersonalEntry => p.ownership === "personal" && p.includeInPersonal,
).map((p) => p.id);

export function getPortfolio(id: string): (PortfolioConfig & { id: PortfolioId }) | undefined {
  return PORTFOLIOS.find((p) => p.id === id);
}

export function isPortfolioId(id: string): id is PortfolioId {
  return PORTFOLIOS.some((p) => p.id === id);
}

export function isPersonalId(id: string): id is PersonalPortfolioId {
  return (PERSONAL_IDS as readonly string[]).includes(id);
}
