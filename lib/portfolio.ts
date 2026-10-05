import {
  PERSONAL_IDS,
  PORTFOLIOS,
  type PortfolioConfig,
  type PortfolioId,
  type PersonalPortfolioId,
} from "@/config/portfolios";
import { allocation, computeCombinedMetrics, computeMetrics, type CombinedMetrics, type Metrics } from "./calculations";
import type { DataIssue, LoadResult, PortfolioData, Snapshot } from "./data/types";

export interface PortfolioView {
  config: PortfolioConfig;
  metrics: Metrics;
  snapshots: Snapshot[];
  issues: DataIssue[];
}

export interface PersonalView {
  ids: readonly PersonalPortfolioId[];
  metrics: CombinedMetrics;
  allocation: { id: PersonalPortfolioId; value: number; share: number }[];
  issues: DataIssue[];
}

type Loaded = Partial<Record<PortfolioId, PortfolioData>>;

export function buildPortfolioView(config: PortfolioConfig, data: PortfolioData | undefined): PortfolioView {
  const snapshots = data?.snapshots ?? [];
  return { config, metrics: computeMetrics(snapshots), snapshots, issues: data?.issues ?? [] };
}

/**
 * The combined Personal view. It reads only PERSONAL_IDS (P1 + P3) — managed
 * money like P2 is never passed in, so it can't leak into these numbers.
 */
export function buildPersonalView(portfolios: Loaded): PersonalView {
  const components: Partial<Record<PersonalPortfolioId, Snapshot[]>> = {};
  for (const id of PERSONAL_IDS) components[id] = portfolios[id]?.snapshots ?? [];
  const metrics = computeCombinedMetrics(components as Record<string, Snapshot[]>);
  const latest = Object.fromEntries(
    PERSONAL_IDS.map((id) => [id, components[id]?.at(-1)?.value ?? 0]),
  ) as Record<PersonalPortfolioId, number>;
  return {
    ids: PERSONAL_IDS,
    metrics,
    allocation: allocation(latest) as PersonalView["allocation"],
    issues: PERSONAL_IDS.flatMap((id) => portfolios[id]?.issues ?? []),
  };
}

export function buildAllViews(load: LoadResult): PortfolioView[] {
  return PORTFOLIOS.map((p) => buildPortfolioView(p, load.portfolios[p.id]));
}

export function allIssues(load: LoadResult): DataIssue[] {
  return PORTFOLIOS.flatMap((p) => load.portfolios[p.id]?.issues ?? []);
}

export interface JournalEntry {
  portfolioId: PortfolioId;
  date: string;
  notes: string;
  invested: number;
  value: number;
  flow: number;
}

/** All notes from all portfolios, newest first. Each entry keeps its own portfolio. */
export function buildJournal(load: LoadResult): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const p of PORTFOLIOS) {
    const snaps = load.portfolios[p.id]?.snapshots ?? [];
    snaps.forEach((s, i) => {
      if (!s.notes) return;
      const prev = snaps[i - 1];
      out.push({ portfolioId: p.id, date: s.date, notes: s.notes, invested: s.invested, value: s.value, flow: prev ? s.invested - prev.invested : 0 });
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.portfolioId.localeCompare(b.portfolioId)));
}
