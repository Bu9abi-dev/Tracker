import { describe, expect, it } from "vitest";
import {
  USD_TO_AED,
  allocation,
  breakEven,
  buildPeriods,
  classifyFlow,
  combineSeries,
  computeCombinedMetrics,
  computeMetrics,
  convert,
  drawdownSeries,
  flowTotals,
  maxDrawdown,
  periodReturn,
  simpleReturn,
  timeWeightedReturn,
  toSeries,
  toUsd,
  wealthIndex,
} from "./calculations";

const snap = (date: string, invested: number, value: number, notes = "") => ({ date, invested, value, notes });

/**
 * Golden fixture, hand-computed (see README "How the numbers are calculated"):
 *   d0  I=1000 V=1000                     base, index 1
 *   d1  I=1000 V=1100  F=0      r = 100/1000                 = +10.0000%
 *   d2  I=1500 V=1650  F=+500   r = (1650−1100−500)/(1100+250) = 50/1350 = +3.7037%
 *   d3  I=1200 V=1300  F=−300   r = (1300−1650+300)/(1650−150) = −50/1500 = −3.3333%
 *   TWR = 1.10 × 1.037037 × 0.966667 − 1 = +10.2716%
 *   Simple = (1300 − 1200) / 1200 = +8.3333%
 */
const golden = [
  snap("2025-01-03", 1000, 1000, "Opening deposit"),
  snap("2025-01-10", 1000, 1100),
  snap("2025-01-17", 1500, 1650, "Deposit"),
  snap("2025-01-24", 1200, 1300, "Withdrew for rent"),
];

describe("currency", () => {
  it("uses the fixed 3.67 peg", () => {
    expect(USD_TO_AED).toBe(3.67);
    expect(convert(100, "AED")).toBeCloseTo(367, 10);
    expect(convert(100, "USD")).toBe(100);
    expect(toUsd(367, "AED")).toBeCloseTo(100, 10);
    expect(toUsd(convert(1234.56, "AED"), "AED")).toBeCloseTo(1234.56, 10);
  });

  it("converts negative P&L without changing sign", () => {
    expect(convert(-50, "AED")).toBeCloseTo(-183.5, 10);
  });
});

describe("flows", () => {
  it("derives flows from cumulative invested", () => {
    const s = toSeries(golden);
    expect(s.map((p) => p.flow)).toEqual([0, 0, 500, -300]);
    expect(s.map((p) => p.flowKind)).toEqual(["none", "none", "deposit", "withdrawal"]);
  });

  it("classifies transfers by note", () => {
    expect(classifyFlow(500, "Transfer in: P5 merged into P1")).toBe("transfer-in");
    expect(classifyFlow(-500, "Transferred to P1")).toBe("transfer-out");
    expect(classifyFlow(500, "Monthly deposit")).toBe("deposit");
    expect(classifyFlow(0, "Transfer")).toBe("none");
  });

  it("totals deposits (including opening capital) and withdrawals", () => {
    expect(flowTotals(toSeries(golden))).toEqual({ deposits: 1500, withdrawals: 300, transfersIn: 0, transfersOut: 0 });
  });

  it("keeps transfers out of deposit/withdrawal totals", () => {
    const s = toSeries([snap("2026-08-07", 1000, 1100), snap("2026-08-14", 1500, 1600, "Transfer in: P5 merged into P1")]);
    expect(flowTotals(s)).toEqual({ deposits: 1000, withdrawals: 0, transfersIn: 500, transfersOut: 0 });
  });
});

describe("period returns (Modified Dietz)", () => {
  it("matches the golden fixture", () => {
    const r = buildPeriods(toSeries(golden)).map((p) => p.return);
    expect(r[0]).toBeCloseTo(0.1, 12);
    expect(r[1]).toBeCloseTo(50 / 1350, 12);
    expect(r[2]).toBeCloseTo(-50 / 1500, 12);
  });

  it("returns null when the period can't be measured", () => {
    expect(periodReturn(0, 0, 0)).toBeNull();
    expect(periodReturn(100, 0, -300)).toBeNull();
  });

  it("weights end-of-period flows at zero", () => {
    // Start 1000, ends 1700 after a 600 entry at the very end: market made 100 on 1000.
    expect(periodReturn(1000, 1700, 600, 600)).toBeCloseTo(0.1, 12);
  });
});

describe("time-weighted return", () => {
  it("chains periods and neutralises deposits and withdrawals", () => {
    const twr = timeWeightedReturn(buildPeriods(toSeries(golden)));
    expect(twr.value).toBeCloseTo(1.1 * (1 + 50 / 1350) * (1 - 50 / 1500) - 1, 12);
    expect(twr.value).toBeCloseTo(0.1027160494, 9);
    expect(twr.skipped).toBe(0);
  });

  it("does not count a deposit as a gain", () => {
    const m = computeMetrics([snap("2025-01-03", 1000, 1000), snap("2025-01-10", 2000, 2000, "Deposit")]);
    expect(m.twr).toBeCloseTo(0, 12);
    expect(m.pnl).toBe(0);
    expect(m.lastChange?.marketChange).toBe(0);
    expect(m.lastChange?.valueChange).toBe(1000);
  });

  it("does not count a withdrawal as a loss", () => {
    const m = computeMetrics([snap("2025-01-03", 1000, 1200), snap("2025-01-10", 500, 700, "Withdrawal")]);
    expect(m.twr).toBeCloseTo(0, 12);
    expect(m.lastChange?.marketChange).toBe(0);
  });

  it("is unaffected by deposit size when market return is the same", () => {
    // +10% market in both periods; one investor adds a big deposit mid-way.
    const small = computeMetrics([snap("d0", 1000, 1000), snap("d1", 1000, 1100), snap("d2", 1000, 1210)]);
    const big = computeMetrics([snap("d0", 1000, 1000), snap("d1", 1000, 1100), snap("d2", 11000, 1100 * 1.1 + 10000 * 1.05)]);
    // Mid-period convention: a deposit invested for half the period earns half of 10%.
    expect(small.twr).toBeCloseTo(0.21, 12);
    expect(big.twr).toBeCloseTo(0.21, 12);
  });

  it("treats the first snapshot as the base, even mid-life", () => {
    const m = computeMetrics([snap("2025-01-03", 1000, 1200), snap("2025-01-10", 1000, 1200)]);
    expect(m.twr).toBe(0); // tracked period: flat
    expect(m.simpleReturn).toBeCloseTo(0.2, 12); // lifetime: +20%
  });

  it("is null with a single snapshot", () => {
    const m = computeMetrics([snap("2025-01-03", 1000, 1000)]);
    expect(m.twr).toBeNull();
    expect(m.lastChange).toBeNull();
  });

  it("flags an unmeasurable period as unreliable instead of hiding it", () => {
    const m = computeMetrics([snap("d0", 100, 100), snap("d1", -200, 0, "Withdrew"), snap("d2", -200, 0)]);
    expect(m.skippedPeriods).toBe(2);
    expect(m.twrReliable).toBe(false);
  });

  it("handles a full withdrawal then a fresh start", () => {
    const m = computeMetrics([
      snap("d0", 1000, 1000),
      snap("d1", 0, 0, "Withdrew everything"),
      snap("d2", 500, 500, "Fresh start"),
      snap("d3", 500, 550),
    ]);
    expect(m.twr).toBeCloseTo(0.1, 12);
    expect(m.twrReliable).toBe(true);
  });
});

describe("drawdown", () => {
  it("is measured on the TWR index", () => {
    const periods = buildPeriods(toSeries(golden));
    const idx = wealthIndex(periods, golden[0]!.date);
    expect(idx.map((p) => p.index)[2]).toBeCloseTo(1.1 * (1 + 50 / 1350), 12);
    const dd = drawdownSeries(idx);
    expect(dd[3]!.drawdown).toBeCloseTo(-50 / 1500, 12);
    expect(maxDrawdown(idx)).toEqual({ drawdown: expect.closeTo(-50 / 1500, 12), peakDate: "2025-01-17", troughDate: "2025-01-24" });
  });

  it("isn't faked by a withdrawal", () => {
    // Value halves only because half was withdrawn — no market loss.
    const m = computeMetrics([snap("d0", 1000, 1000), snap("d1", 500, 500, "Withdrew")]);
    expect(m.maxDrawdown?.drawdown).toBe(0);
    expect(m.currentDrawdown).toBe(0);
  });

  it("isn't hidden by a deposit", () => {
    // Market falls 20%, then a big deposit lifts value above the old peak.
    const m = computeMetrics([snap("d0", 1000, 1000), snap("d1", 1000, 800), snap("d2", 3000, 2800, "Deposit")]);
    expect(m.maxDrawdown?.drawdown).toBeCloseTo(-0.2, 12);
    expect(m.currentDrawdown).toBeCloseTo(-0.2, 12);
  });

  it("tracks recovery: current drawdown goes back to 0 at a new peak", () => {
    const m = computeMetrics([snap("d0", 1000, 1000), snap("d1", 1000, 900), snap("d2", 1000, 1100)]);
    expect(m.maxDrawdown?.drawdown).toBeCloseTo(-0.1, 12);
    expect(m.currentDrawdown).toBe(0);
  });
});

describe("simple return, break-even, best/worst", () => {
  it("computes simple return", () => {
    expect(simpleReturn(1200, 1300)).toBeCloseTo(1 / 12, 12);
    expect(simpleReturn(0, 100)).toBeNull();
  });

  it("computes break-even only when in loss", () => {
    expect(breakEven(1000, 800)).toEqual({ amount: 200, pctNeeded: 0.25 });
    expect(breakEven(1000, 1000)).toBeNull();
    expect(breakEven(1000, 1200)).toBeNull();
    expect(breakEven(1000, 0)).toEqual({ amount: 1000, pctNeeded: null });
  });

  it("finds best and worst weeks by market return", () => {
    const m = computeMetrics(golden);
    expect(m.best?.endDate).toBe("2025-01-10");
    expect(m.best?.return).toBeCloseTo(0.1, 12);
    expect(m.worst?.endDate).toBe("2025-01-24");
    expect(m.worst?.marketChange).toBe(-50);
  });

  it("computes the full golden metrics", () => {
    const m = computeMetrics(golden);
    expect(m.invested).toBe(1200);
    expect(m.value).toBe(1300);
    expect(m.pnl).toBe(100);
    expect(m.simpleReturn).toBeCloseTo(1 / 12, 12);
    expect(m.twr).toBeCloseTo(0.1027160494, 9);
    expect(m.lastChange).toEqual({
      startDate: "2025-01-17",
      endDate: "2025-01-24",
      marketChange: -50,
      return: expect.closeTo(-50 / 1500, 12),
      valueChange: -350,
      flow: -300,
    });
    expect(m.totals.deposits).toBe(1500);
    expect(m.totals.withdrawals).toBe(300);
    expect(m.chart).toHaveLength(4);
  });
});

describe("combined series", () => {
  const A = [snap("2025-01-03", 1000, 1000), snap("2025-01-10", 1000, 1100), snap("2025-01-17", 1000, 1210)];
  const B = [snap("2025-01-10", 500, 600, "Mid-life import"), snap("2025-01-17", 500, 540)];

  it("enters a new component at its first value (not a gain)", () => {
    const c = combineSeries({ A, B });
    expect(c.series.map((p) => [p.date, p.invested, p.value, p.flow])).toEqual([
      ["2025-01-03", 1000, 1000, 0],
      ["2025-01-10", 1500, 1700, 600],
      ["2025-01-17", 1500, 1750, 0],
    ]);
    const m = computeCombinedMetrics({ A, B });
    // Period 1: only A's +10% (B entered at the end). Period 2: 50 / 1700.
    expect(m.twr).toBeCloseTo(1.1 * (1 + 50 / 1700) - 1, 12);
    expect(m.invested).toBe(1500);
    expect(m.value).toBe(1750);
    expect(m.pnl).toBe(250);
  });

  it("aligns different snapshot weekdays within tolerance", () => {
    const P = [snap("2025-01-03", 1000, 1000), snap("2025-01-10", 1000, 1100)];
    const Q = [snap("2025-01-05", 100, 100), snap("2025-01-12", 100, 90)];
    const c = combineSeries({ P, Q });
    expect(c.excludedDates).toEqual([]);
    expect(c.series.map((p) => p.date)).toEqual(["2025-01-03", "2025-01-05", "2025-01-10", "2025-01-12"]);
  });

  it("excludes dates where a component is stale instead of forward-filling returns", () => {
    const P = ["01-03", "01-10", "01-17", "01-24", "01-31"].map((d, i) => snap(`2025-${d}`, 1000, 1000 + i * 10));
    const Q = [snap("2025-01-03", 1000, 1000), snap("2025-01-31", 1000, 1200)];
    const c = combineSeries({ P, Q });
    // 01-10 is still usable (Q's snapshot is exactly 7 days old); 01-17 and 01-24 aren't.
    expect(c.excludedDates).toEqual(["2025-01-17", "2025-01-24"]);
    expect(c.series.map((p) => p.date)).toEqual(["2025-01-03", "2025-01-10", "2025-01-31"]);
    const m = computeCombinedMetrics({ P, Q });
    expect(m.twr).toBeCloseTo((1040 + 1200) / 2000 - 1, 12);
  });

  it("reports stale components", () => {
    const P = [snap("2025-01-03", 1, 1), snap("2025-02-28", 1, 1)];
    const Q = [snap("2025-01-03", 1, 1)];
    expect(combineSeries({ P, Q }).staleComponents).toEqual(["Q"]);
  });

  it("sums component flow totals so transfers stay transfers", () => {
    const P = [snap("2025-01-03", 1000, 1000), snap("2025-01-10", 1500, 1500, "Transfer in: merged")];
    const Q = [snap("2025-01-03", 200, 200), snap("2025-01-10", 350, 350)];
    const m = computeCombinedMetrics({ P, Q });
    expect(m.totals).toEqual({ deposits: 1350, withdrawals: 0, transfersIn: 500, transfersOut: 0 });
    expect(m.twr).toBeCloseTo(0, 12);
  });
});

describe("allocation", () => {
  it("returns shares of positive values", () => {
    const a = allocation({ P1: 750, P3: 250, X: 0 });
    expect(a).toEqual([
      { id: "P1", value: 750, share: 0.75 },
      { id: "P3", value: 250, share: 0.25 },
    ]);
  });
});
