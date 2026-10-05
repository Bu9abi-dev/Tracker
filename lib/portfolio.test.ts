import { describe, expect, it } from "vitest";
import { PERSONAL_IDS, PORTFOLIOS, assertConfig, type PortfolioConfig } from "@/config/portfolios";
import type { PortfolioData } from "./data/types";
import { buildJournal, buildPersonalView } from "./portfolio";

const data = (portfolioId: "P1" | "P2" | "P3", rows: [string, number, number, string?][]): PortfolioData => ({
  portfolioId,
  snapshots: rows.map(([date, invested, value, notes = ""]) => ({ date, invested, value, notes })),
  issues: [],
});

const P1 = data("P1", [["2025-01-03", 1000, 1000], ["2025-01-10", 1000, 1100]]);
const P3 = data("P3", [["2025-01-03", 200, 200], ["2025-01-10", 350, 300, "DCA"]]);

describe("Personal = P1 + P3 only", () => {
  it("is exactly P1 and P3 per config", () => {
    expect([...PERSONAL_IDS].sort()).toEqual(["P1", "P3"]);
    for (const p of PORTFOLIOS) if (p.ownership === "managed") expect(PERSONAL_IDS).not.toContain(p.id);
  });

  it("never changes when P2 data changes", () => {
    const without = buildPersonalView({ P1, P3 });
    const withSmallP2 = buildPersonalView({ P1, P3, P2: data("P2", [["2025-01-03", 50000, 50000]]) });
    const withWildP2 = buildPersonalView({
      P1,
      P3,
      P2: data("P2", [["2024-01-01", 1, 1e9], ["2025-01-05", 9e9, 1], ["2025-01-10", 5, 5]]),
    });
    expect(withSmallP2.metrics).toEqual(without.metrics);
    expect(withWildP2.metrics).toEqual(without.metrics);
    expect(withWildP2.allocation).toEqual(without.allocation);
    expect(withWildP2.allocation.map((a) => a.id)).not.toContain("P2");
  });

  it("sums P1 and P3", () => {
    const v = buildPersonalView({ P1, P3 });
    expect(v.metrics.invested).toBe(1350);
    expect(v.metrics.value).toBe(1400);
    expect(v.allocation.map((a) => [a.id, a.share])).toEqual([
      ["P1", 1100 / 1400],
      ["P3", 300 / 1400],
    ]);
  });

  it("rejects a config that puts managed money into Personal", () => {
    const bad = [{ ...PORTFOLIOS[1], includeInPersonal: true } as unknown as PortfolioConfig];
    expect(() => assertConfig(bad)).toThrow(/managed/);
  });

  it("rejects archived or planned portfolios in Personal", () => {
    const bad = [{ ...PORTFOLIOS[4], includeInPersonal: true } as unknown as PortfolioConfig];
    expect(() => assertConfig(bad)).toThrow(/archived/);
  });
});

describe("journal", () => {
  it("keeps notes tagged with their own portfolio, newest first", () => {
    const j = buildJournal({ portfolios: { P1: data("P1", [["2025-01-03", 1, 1, "a"]]), P2: data("P2", [["2025-01-10", 1, 1, "mum"]]) }, fetchedAt: "" });
    expect(j.map((e) => [e.portfolioId, e.notes])).toEqual([["P2", "mum"], ["P1", "a"]]);
  });
});
