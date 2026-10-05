import { findPortfolio, type PortfolioConfig, type Registry } from "@/config/portfolios";
import {
  allocation,
  combinedSectorAllocation,
  computeCombinedMetrics,
  computeMetrics,
  type CombinedMetrics,
  type Metrics,
  type SectorSlice,
} from "./calculations";
import type { DataIssue, LoadResult, PortfolioData, Snapshot, Statement } from "./data/types";

export interface PortfolioView {
  config: PortfolioConfig;
  metrics: Metrics;
  snapshots: Snapshot[];
  issues: DataIssue[];
  statement: Statement | null;
}

export interface PersonalView {
  ids: readonly string[];
  metrics: CombinedMetrics;
  allocation: { id: string; value: number; share: number }[];
  /** Sector allocation from the latest statement of each Personal portfolio. */
  sectors: SectorSlice[];
  /** Personal portfolios that have a statement (sector view covers only these). */
  sectorCoverage: string[];
  issues: DataIssue[];
}

export function buildPortfolioView(config: PortfolioConfig, data: PortfolioData | undefined, statement?: Statement): PortfolioView {
  const snapshots = data?.snapshots ?? [];
  return { config, metrics: computeMetrics(snapshots), snapshots, issues: data?.issues ?? [], statement: statement ?? null };
}

/**
 * The combined Personal view. It reads only registry.personalIds — managed money
 * (P2 or any portfolio created as managed) is never in that list, so it can't
 * leak into these numbers, the allocation, or the sector view.
 */
export function buildPersonalView(
  registry: Registry,
  data: Record<string, PortfolioData | undefined>,
  statements: Record<string, Statement | undefined> = {},
): PersonalView {
  const ids = registry.personalIds.filter((id) => findPortfolio(registry, id)?.ownership === "personal");
  const components: Record<string, Snapshot[]> = {};
  for (const id of ids) components[id] = data[id]?.snapshots ?? [];
  const metrics = computeCombinedMetrics(components);
  const latest = Object.fromEntries(ids.map((id) => [id, components[id]?.at(-1)?.value ?? 0]));
  const holdingsBy = Object.fromEntries(ids.map((id) => [id, statements[id]?.holdings]));
  return {
    ids,
    metrics,
    allocation: allocation(latest),
    sectors: combinedSectorAllocation(holdingsBy, ids),
    sectorCoverage: ids.filter((id) => statements[id]),
    issues: ids.flatMap((id) => data[id]?.issues ?? []),
  };
}

export function buildAllViews(load: LoadResult): PortfolioView[] {
  return load.registry.list.map((p) => buildPortfolioView(p, load.data[p.id], load.statements[p.id]));
}

export interface JournalEntry {
  portfolioId: string;
  date: string;
  notes: string;
  invested: number;
  value: number;
  flow: number;
}

/** All notes from all portfolios, newest first. Each entry keeps its own portfolio. */
export function buildJournal(load: Pick<LoadResult, "registry" | "data">): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const p of load.registry.list) {
    const snaps = load.data[p.id]?.snapshots ?? [];
    snaps.forEach((s, i) => {
      if (!s.notes) return;
      const prev = snaps[i - 1];
      out.push({ portfolioId: p.id, date: s.date, notes: s.notes, invested: s.invested, value: s.value, flow: prev ? s.invested - prev.invested : 0 });
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.portfolioId.localeCompare(b.portfolioId)));
}
