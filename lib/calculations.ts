/**
 * All financial math lives here. Pure functions, no I/O, everything in USD.
 *
 * Data semantics (one row = one snapshot, usually weekly):
 *   - `invested` is cumulative net capital. The cash flow for a period is
 *     invested[i] − invested[i−1]: positive = deposit, negative = withdrawal.
 *   - `value` is the market value at the snapshot date, after that period's flow.
 *   - Deposits raise invested and value equally, so they are never counted as gains.
 *
 * Returns:
 *   - Simple return = (value − invested) / invested.
 *   - Time-weighted return (TWR) chains per-period returns so deposit/withdrawal
 *     timing and size don't distort performance. Each period uses Modified Dietz
 *     with the flow assumed mid-period (we only know the flow happened somewhere
 *     between two snapshots):
 *         r = (V_end − V_start − F) / (V_start + 0.5·F)
 *   - The first snapshot is the base (index = 1.0). It has no return of its own,
 *     because whatever gain it already carries happened before tracking started.
 *   - A period whose denominator is ≤ 0 (e.g. everything withdrawn) can't be
 *     measured; it's skipped and the TWR is marked unreliable.
 */

export const USD_TO_AED = 3.67;
export type Currency = "USD" | "AED";

/** Notes containing these words mark a capital change as a transfer between portfolios. */
export const TRANSFER_PATTERN = /\b(transfer(?:red)?|merged?|moved (?:in|out))\b/i;

export function convert(usd: number, currency: Currency): number {
  return currency === "AED" ? usd * USD_TO_AED : usd;
}

export function toUsd(amount: number, currency: Currency): number {
  return currency === "AED" ? amount / USD_TO_AED : amount;
}

// ---------------------------------------------------------------------------
// Series & periods
// ---------------------------------------------------------------------------

export interface SnapshotLike {
  date: string;
  invested: number;
  value: number;
  notes?: string;
}

export type FlowKind = "none" | "deposit" | "withdrawal" | "transfer-in" | "transfer-out";

/** A point in a series with its inbound flow (the capital change since the previous point). */
export interface SeriesPoint {
  date: string;
  invested: number;
  value: number;
  /** Net external flow since the previous point. 0 for the first point. */
  flow: number;
  /**
   * Portion of `flow` that arrived at the very end of the period (weight 0 in
   * Modified Dietz) rather than mid-period. Used when a portfolio joins a
   * combined view on a snapshot date. Defaults to 0.
   */
  endOfPeriodFlow?: number;
  flowKind: FlowKind;
  notes: string;
}

export interface Period {
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
  flow: number;
  /** Market-driven change in $ — value change with the flow removed. */
  marketChange: number;
  /** Modified Dietz return, or null when the period can't be measured. */
  return: number | null;
}

export function classifyFlow(flow: number, notes = ""): FlowKind {
  if (flow === 0) return "none";
  const transfer = TRANSFER_PATTERN.test(notes);
  if (flow > 0) return transfer ? "transfer-in" : "deposit";
  return transfer ? "transfer-out" : "withdrawal";
}

/** Snapshot rows (sorted by date) → series points with flows derived from invested. */
export function toSeries(snapshots: readonly SnapshotLike[]): SeriesPoint[] {
  return snapshots.map((s, i) => {
    const prev = snapshots[i - 1];
    const flow = prev ? round2(s.invested - prev.invested) : 0;
    const notes = s.notes ?? "";
    return { date: s.date, invested: s.invested, value: s.value, flow, flowKind: classifyFlow(flow, notes), notes };
  });
}

/**
 * Modified Dietz return for one period. `flow` is assumed to arrive mid-period,
 * except `endOfPeriodFlow` (a part of `flow`) which arrives at the end (weight 0).
 */
export function periodReturn(startValue: number, endValue: number, flow: number, endOfPeriodFlow = 0): number | null {
  const denominator = startValue + 0.5 * (flow - endOfPeriodFlow);
  if (!(denominator > 0)) return null;
  return (endValue - startValue - flow) / denominator;
}

export function buildPeriods(series: readonly SeriesPoint[]): Period[] {
  const periods: Period[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]!;
    const b = series[i]!;
    periods.push({
      startDate: a.date,
      endDate: b.date,
      startValue: a.value,
      endValue: b.value,
      flow: b.flow,
      marketChange: b.value - a.value - b.flow,
      return: periodReturn(a.value, b.value, b.flow, b.endOfPeriodFlow ?? 0),
    });
  }
  return periods;
}

export interface TwrResult {
  /** Cumulative TWR since the first snapshot, or null with no measurable period. */
  value: number | null;
  /** Periods that couldn't be measured (chain is unreliable if > 0). */
  skipped: number;
}

export function timeWeightedReturn(periods: readonly Period[]): TwrResult {
  let growth = 1;
  let measured = 0;
  let skipped = 0;
  for (const p of periods) {
    if (p.return === null) {
      skipped++;
      continue;
    }
    growth *= 1 + p.return;
    measured++;
  }
  return { value: measured > 0 ? growth - 1 : null, skipped };
}

/** Growth-of-$1 index on TWR. Starts at 1.0; unmeasurable periods carry the index flat. */
export function wealthIndex(periods: readonly Period[], firstDate: string): { date: string; index: number }[] {
  const out = [{ date: firstDate, index: 1 }];
  let index = 1;
  for (const p of periods) {
    if (p.return !== null) index *= 1 + p.return;
    out.push({ date: p.endDate, index });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drawdown, break-even, simple return
// ---------------------------------------------------------------------------

export interface DrawdownPoint {
  date: string;
  /** ≤ 0. −0.12 = 12% below the previous peak. */
  drawdown: number;
}

/** Drawdown measured on the TWR index, so deposits can't hide a fall and withdrawals can't fake one. */
export function drawdownSeries(index: readonly { date: string; index: number }[]): DrawdownPoint[] {
  let peak = -Infinity;
  return index.map(({ date, index: v }) => {
    peak = Math.max(peak, v);
    return { date, drawdown: peak > 0 ? v / peak - 1 : 0 };
  });
}

export interface MaxDrawdown {
  drawdown: number;
  peakDate: string;
  troughDate: string;
}

export function maxDrawdown(index: readonly { date: string; index: number }[]): MaxDrawdown | null {
  if (index.length === 0) return null;
  let peak = index[0]!;
  let worst: MaxDrawdown = { drawdown: 0, peakDate: peak.date, troughDate: peak.date };
  for (const p of index) {
    if (p.index > peak.index) peak = p;
    const dd = p.index / peak.index - 1;
    if (dd < worst.drawdown) worst = { drawdown: dd, peakDate: peak.date, troughDate: p.date };
  }
  return worst;
}

export function simpleReturn(invested: number, value: number): number | null {
  if (!(invested > 0)) return null;
  return (value - invested) / invested;
}

export interface BreakEven {
  /** Dollars the portfolio needs to gain to get back to invested capital. */
  amount: number;
  /** Gain needed on the current value, e.g. 0.25 = +25%. */
  pctNeeded: number | null;
}

/** Only meaningful when in loss; returns null otherwise. */
export function breakEven(invested: number, value: number): BreakEven | null {
  if (!(value < invested)) return null;
  const amount = invested - value;
  return { amount, pctNeeded: value > 0 ? amount / value : null };
}

// ---------------------------------------------------------------------------
// Flows totals & best/worst
// ---------------------------------------------------------------------------

export interface FlowTotals {
  /** Includes the opening capital of the first snapshot. */
  deposits: number;
  /** Positive number. */
  withdrawals: number;
  transfersIn: number;
  /** Positive number. */
  transfersOut: number;
}

export function flowTotals(series: readonly SeriesPoint[]): FlowTotals {
  const t: FlowTotals = { deposits: 0, withdrawals: 0, transfersIn: 0, transfersOut: 0 };
  series.forEach((p, i) => {
    if (i === 0) {
      // Opening balance: treat starting capital as the first deposit.
      if (p.invested > 0) t.deposits += p.invested;
      return;
    }
    if (p.flowKind === "deposit") t.deposits += p.flow;
    else if (p.flowKind === "withdrawal") t.withdrawals += -p.flow;
    else if (p.flowKind === "transfer-in") t.transfersIn += p.flow;
    else if (p.flowKind === "transfer-out") t.transfersOut += -p.flow;
  });
  return t;
}

export function addTotals(a: FlowTotals, b: FlowTotals): FlowTotals {
  return {
    deposits: a.deposits + b.deposits,
    withdrawals: a.withdrawals + b.withdrawals,
    transfersIn: a.transfersIn + b.transfersIn,
    transfersOut: a.transfersOut + b.transfersOut,
  };
}

export interface ExtremePeriod {
  startDate: string;
  endDate: string;
  return: number;
  marketChange: number;
}

export function bestAndWorst(periods: readonly Period[]): { best: ExtremePeriod | null; worst: ExtremePeriod | null } {
  let best: ExtremePeriod | null = null;
  let worst: ExtremePeriod | null = null;
  for (const p of periods) {
    if (p.return === null) continue;
    const e = { startDate: p.startDate, endDate: p.endDate, return: p.return, marketChange: p.marketChange };
    if (!best || e.return > best.return) best = e;
    if (!worst || e.return < worst.return) worst = e;
  }
  return { best, worst };
}

// ---------------------------------------------------------------------------
// Full metrics
// ---------------------------------------------------------------------------

export interface ChartRow {
  date: string;
  invested: number;
  value: number;
  pnl: number;
  flow: number;
  flowKind: FlowKind;
  index: number;
  drawdown: number;
  /** Market-only change vs the previous snapshot; null for the first row. */
  marketChange: number | null;
  /** Period return vs the previous snapshot; null for the first row or if unmeasurable. */
  periodReturn: number | null;
}

export interface Metrics {
  firstDate: string | null;
  lastDate: string | null;
  invested: number;
  value: number;
  pnl: number;
  simpleReturn: number | null;
  twr: number | null;
  /** False when any period couldn't be measured. */
  twrReliable: boolean;
  skippedPeriods: number;
  lastChange: {
    startDate: string;
    endDate: string;
    marketChange: number;
    return: number | null;
    /** Raw value change including any deposit/withdrawal. */
    valueChange: number;
    flow: number;
  } | null;
  totals: FlowTotals;
  maxDrawdown: MaxDrawdown | null;
  currentDrawdown: number | null;
  breakEven: BreakEven | null;
  best: ExtremePeriod | null;
  worst: ExtremePeriod | null;
  periodCount: number;
  chart: ChartRow[];
}

export function emptyMetrics(): Metrics {
  return {
    firstDate: null,
    lastDate: null,
    invested: 0,
    value: 0,
    pnl: 0,
    simpleReturn: null,
    twr: null,
    twrReliable: true,
    skippedPeriods: 0,
    lastChange: null,
    totals: { deposits: 0, withdrawals: 0, transfersIn: 0, transfersOut: 0 },
    maxDrawdown: null,
    currentDrawdown: null,
    breakEven: null,
    best: null,
    worst: null,
    periodCount: 0,
    chart: [],
  };
}

export function metricsFromSeries(series: readonly SeriesPoint[], totals: FlowTotals = flowTotals(series)): Metrics {
  if (series.length === 0) return emptyMetrics();
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const periods = buildPeriods(series);
  const twr = timeWeightedReturn(periods);
  const index = wealthIndex(periods, first.date);
  const dd = drawdownSeries(index);
  const { best, worst } = bestAndWorst(periods);
  const lastPeriod = periods[periods.length - 1];

  return {
    firstDate: first.date,
    lastDate: last.date,
    invested: last.invested,
    value: last.value,
    pnl: last.value - last.invested,
    simpleReturn: simpleReturn(last.invested, last.value),
    twr: twr.value,
    twrReliable: twr.skipped === 0,
    skippedPeriods: twr.skipped,
    lastChange: lastPeriod
      ? {
          startDate: lastPeriod.startDate,
          endDate: lastPeriod.endDate,
          marketChange: lastPeriod.marketChange,
          return: lastPeriod.return,
          valueChange: lastPeriod.endValue - lastPeriod.startValue,
          flow: lastPeriod.flow,
        }
      : null,
    totals,
    maxDrawdown: maxDrawdown(index),
    currentDrawdown: dd[dd.length - 1]?.drawdown ?? null,
    breakEven: breakEven(last.invested, last.value),
    best,
    worst,
    periodCount: periods.length,
    chart: series.map((p, i) => ({
      date: p.date,
      invested: p.invested,
      value: p.value,
      pnl: p.value - p.invested,
      flow: p.flow,
      flowKind: p.flowKind,
      index: index[i]!.index,
      drawdown: dd[i]!.drawdown,
      marketChange: i > 0 ? periods[i - 1]!.marketChange : null,
      periodReturn: i > 0 ? periods[i - 1]!.return : null,
    })),
  };
}

export function computeMetrics(snapshots: readonly SnapshotLike[]): Metrics {
  return metricsFromSeries(toSeries(snapshots));
}

// ---------------------------------------------------------------------------
// Combined (Personal) series
// ---------------------------------------------------------------------------

export interface CombineOptions {
  /** A component's last snapshot may be at most this many days old to be used on a date. */
  toleranceDays?: number;
}

export interface CombinedResult {
  series: SeriesPoint[];
  /** Union dates left out because a started component had no snapshot within tolerance. */
  excludedDates: string[];
  /** Latest snapshot date per component. */
  latestByComponent: Record<string, string | null>;
  /** Components whose latest snapshot is older than tolerance vs the newest component. */
  staleComponents: string[];
}

const DAY_MS = 86_400_000;
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * Combine several portfolios into one series without forward-filling stale data into returns.
 *
 * A union date is used only if every component that has started has a snapshot
 * on or within `toleranceDays` before it. Each component contributes its latest
 * snapshot on or before the date. Flows between two used dates are each
 * component's own capital change; a component that starts in between enters at
 * its first value (so a mid-life import isn't counted as a gain).
 */
export function combineSeries(
  components: Record<string, readonly SnapshotLike[]>,
  { toleranceDays = 7 }: CombineOptions = {},
): CombinedResult {
  const ids = Object.keys(components).filter((id) => components[id]!.length > 0);
  const latestByComponent: Record<string, string | null> = {};
  for (const id of Object.keys(components)) {
    const s = components[id]!;
    latestByComponent[id] = s.length ? s[s.length - 1]!.date : null;
  }
  if (ids.length === 0) return { series: [], excludedDates: [], latestByComponent, staleComponents: [] };

  const dates = [...new Set(ids.flatMap((id) => components[id]!.map((s) => s.date)))].sort();
  const cursor: Record<string, number> = Object.fromEntries(ids.map((id) => [id, -1]));
  const series: SeriesPoint[] = [];
  const excludedDates: string[] = [];
  // State per component at the previous *used* date.
  let prevUsed: Record<string, SnapshotLike | null> | null = null;

  for (const date of dates) {
    const current: Record<string, SnapshotLike | null> = {};
    let usable = true;
    for (const id of ids) {
      const snaps = components[id]!;
      let c = cursor[id]!;
      while (c + 1 < snaps.length && snaps[c + 1]!.date <= date) c++;
      cursor[id] = c;
      const snap = c >= 0 ? snaps[c]! : null;
      current[id] = snap;
      if (snap && daysBetween(snap.date, date) > toleranceDays) usable = false;
    }
    if (!usable) {
      excludedDates.push(date);
      continue;
    }

    let invested = 0;
    let value = 0;
    let flow = 0;
    let entryFlow = 0;
    const notes: string[] = [];
    for (const id of ids) {
      const snap = current[id];
      if (!snap) continue;
      invested += snap.invested;
      value += snap.value;
      const before = prevUsed?.[id] ?? null;
      if (prevUsed) {
        if (before) flow += snap.invested - before.invested;
        else {
          // Component started since the last used date: enters at its first value.
          const first = components[id]![0]!;
          flow += first.value + (snap.invested - first.invested);
          if (snap.date === first.date) entryFlow += first.value;
        }
      }
      if (snap.date === date && snap.notes) notes.push(snap.notes);
    }
    flow = round2(flow);
    const note = notes.join(" · ");
    series.push({
      date,
      invested,
      value,
      flow,
      endOfPeriodFlow: round2(entryFlow),
      flowKind: classifyFlow(flow, note),
      notes: note,
    });
    prevUsed = current;
  }

  const newest = ids.map((id) => latestByComponent[id]!).sort().at(-1)!;
  const staleComponents = ids.filter((id) => daysBetween(latestByComponent[id]!, newest) > toleranceDays);
  return { series, excludedDates, latestByComponent, staleComponents };
}

export interface CombinedMetrics extends Metrics {
  excludedDates: string[];
  staleComponents: string[];
  latestByComponent: Record<string, string | null>;
}

/**
 * Metrics for a combined view. Current invested/value are each component's latest
 * snapshot summed; returns, drawdown and history come from the combined series.
 * Flow totals are summed from components (so a transfer stays a transfer).
 */
export function computeCombinedMetrics(
  components: Record<string, readonly SnapshotLike[]>,
  options?: CombineOptions,
): CombinedMetrics {
  const combined = combineSeries(components, options);
  const totals = Object.values(components)
    .map((s) => flowTotals(toSeries(s)))
    .reduce(addTotals, { deposits: 0, withdrawals: 0, transfersIn: 0, transfersOut: 0 });
  const m = metricsFromSeries(combined.series, totals);

  const latest = Object.values(components).flatMap((s) => (s.length ? [s[s.length - 1]!] : []));
  if (latest.length) {
    m.invested = latest.reduce((a, s) => a + s.invested, 0);
    m.value = latest.reduce((a, s) => a + s.value, 0);
    m.pnl = m.value - m.invested;
    m.simpleReturn = simpleReturn(m.invested, m.value);
    m.breakEven = breakEven(m.invested, m.value);
  }
  return {
    ...m,
    excludedDates: combined.excludedDates,
    staleComponents: combined.staleComponents,
    latestByComponent: combined.latestByComponent,
  };
}

/** Allocation shares by current value. Negative/zero values are excluded. */
export function allocation(values: Record<string, number>): { id: string; value: number; share: number }[] {
  const entries = Object.entries(values).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return entries.map(([id, value]) => ({ id, value, share: total > 0 ? value / total : 0 }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Holdings (from statements)
// ---------------------------------------------------------------------------

export interface HoldingLike {
  symbol: string;
  name: string;
  sector: string;
  valueUsd: number;
  costBasisUsd: number | null;
}

export interface HoldingRow<H extends HoldingLike = HoldingLike> {
  holding: H;
  /** Share of the statement's holdings total. */
  weight: number;
  /** Unrealized P&L; null when the statement has no cost for this position. */
  pnl: number | null;
  pnlPct: number | null;
}

export interface HoldingsSummary<H extends HoldingLike = HoldingLike> {
  totalValue: number;
  /** Sum of cost for positions that have one. */
  costKnown: number;
  /** Value of the positions that have a cost (so P&L % compares like with like). */
  valueWithCost: number;
  /** Unrealized P&L across positions with a known cost. */
  pnl: number | null;
  pnlPct: number | null;
  positionsWithCost: number;
  positions: number;
  rows: HoldingRow<H>[];
}

/** Totals, weights and unrealized P&L. Positions without a cost are left out of P&L, never guessed. */
export function holdingsSummary<H extends HoldingLike>(holdings: readonly H[]): HoldingsSummary<H> {
  const totalValue = holdings.reduce((a, h) => a + h.valueUsd, 0);
  let costKnown = 0;
  let valueWithCost = 0;
  let positionsWithCost = 0;
  const rows = holdings
    .map((h) => {
      const hasCost = h.costBasisUsd !== null && h.costBasisUsd > 0;
      if (hasCost) {
        costKnown += h.costBasisUsd!;
        valueWithCost += h.valueUsd;
        positionsWithCost++;
      }
      const pnl = hasCost ? h.valueUsd - h.costBasisUsd! : null;
      return { holding: h, weight: totalValue > 0 ? h.valueUsd / totalValue : 0, pnl, pnlPct: hasCost ? pnl! / h.costBasisUsd! : null };
    })
    .sort((a, b) => b.holding.valueUsd - a.holding.valueUsd);
  const pnl = positionsWithCost ? valueWithCost - costKnown : null;
  return {
    totalValue,
    costKnown,
    valueWithCost,
    pnl,
    pnlPct: pnl !== null && costKnown > 0 ? pnl / costKnown : null,
    positionsWithCost,
    positions: holdings.length,
    rows,
  };
}

export interface SectorSlice {
  sector: string;
  value: number;
  share: number;
  positions: number;
}

/** Value per sector, largest first. */
export function sectorAllocation(holdings: readonly HoldingLike[]): SectorSlice[] {
  const by = new Map<string, { value: number; positions: number }>();
  for (const h of holdings) {
    if (!(h.valueUsd > 0)) continue;
    const s = by.get(h.sector) ?? { value: 0, positions: 0 };
    s.value += h.valueUsd;
    s.positions++;
    by.set(h.sector, s);
  }
  const total = [...by.values()].reduce((a, s) => a + s.value, 0);
  return [...by.entries()]
    .map(([sector, s]) => ({ sector, value: s.value, positions: s.positions, share: total > 0 ? s.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Sector allocation across several portfolios' latest statements.
 * Only the ids passed in are used — callers pass the Personal ids, so managed money stays out.
 */
export function combinedSectorAllocation(
  holdingsByPortfolio: Record<string, readonly HoldingLike[] | undefined>,
  ids: readonly string[],
): SectorSlice[] {
  return sectorAllocation(ids.flatMap((id) => holdingsByPortfolio[id] ?? []));
}
