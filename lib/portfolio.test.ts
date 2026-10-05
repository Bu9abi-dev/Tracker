import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRY, buildRegistry } from "@/config/portfolios";
import type { PortfolioData, Statement } from "./data/types";
import { buildJournal, buildPersonalView } from "./portfolio";

const data = (portfolioId: string, rows: [string, number, number, string?][]): PortfolioData => ({
  portfolioId,
  snapshots: rows.map(([date, invested, value, notes = ""]) => ({ date, invested, value, notes })),
  issues: [],
});
const stmt = (portfolioId: string, holdings: [string, string, number][]): Statement => ({
  id: `s-${portfolioId}`,
  portfolioId,
  statementDate: "2026-10-01",
  savedAt: "",
  fileName: "x.pdf",
  broker: "",
  accountHint: "",
  reportedTotalUsd: null,
  holdings: holdings.map(([symbol, sector, valueUsd]) => ({ symbol, name: symbol, assetType: "stock", sector: sector as never, quantity: null, priceUsd: null, valueUsd, costBasisUsd: null })),
});

const P1 = data("P1", [["2025-01-03", 1000, 1000], ["2025-01-10", 1000, 1100]]);
const P3 = data("P3", [["2025-01-03", 200, 200], ["2025-01-10", 350, 300, "DCA"]]);

describe("Personal = P1 + P3 only", () => {
  it("is exactly P1 and P3 by default", () => {
    expect(DEFAULT_REGISTRY.personalIds).toEqual(["P1", "P3"]);
  });

  it("never changes when P2 data or P2 holdings change", () => {
    const base = buildPersonalView(DEFAULT_REGISTRY, { P1, P3 }, { P1: stmt("P1", [["NVDA", "Information Technology", 500]]) });
    const wild = buildPersonalView(
      DEFAULT_REGISTRY,
      { P1, P3, P2: data("P2", [["2024-01-01", 1, 1e9], ["2025-01-05", 9e9, 1]]) },
      { P1: stmt("P1", [["NVDA", "Information Technology", 500]]), P2: stmt("P2", [["ELF", "Consumer Staples", 1e9]]) },
    );
    expect(wild.metrics).toEqual(base.metrics);
    expect(wild.allocation).toEqual(base.allocation);
    expect(wild.sectors).toEqual(base.sectors);
    expect(wild.sectors.map((s) => s.sector)).not.toContain("Consumer Staples");
  });

  it("keeps P2 out even if the sheet says it is personal and in Personal", () => {
    const reg = buildRegistry([{ id: "P2", ownership: "personal", includeInPersonal: "yes" }]);
    expect(reg.personalIds).toEqual(["P1", "P3"]);
    expect(reg.list.find((p) => p.id === "P2")?.ownership).toBe("managed");
    expect(reg.issues.join(" ")).toMatch(/P2 is managed/);
    const v = buildPersonalView(reg, { P1, P3, P2: data("P2", [["2025-01-03", 5, 5]]) });
    expect(v.ids).toEqual(["P1", "P3"]);
  });

  it("keeps new managed portfolios out of Personal", () => {
    const reg = buildRegistry([{ id: "P6", name: "Dad's savings", ownership: "managed", includeInPersonal: true, status: "active" }]);
    expect(reg.personalIds).toEqual(["P1", "P3"]);
    const v = buildPersonalView(reg, { P1, P3, P6: data("P6", [["2025-01-03", 1e6, 1e6]]) }, { P6: stmt("P6", [["X", "Energy", 1e6]]) });
    expect(v.metrics.value).toBe(1400);
    expect(v.sectors).toEqual([]);
  });

  it("adds a new personal portfolio only when opted in", () => {
    expect(buildRegistry([{ id: "P6", name: "Gold", status: "active" }]).personalIds).toEqual(["P1", "P3"]);
    expect(buildRegistry([{ id: "P6", name: "Gold", status: "active", includeInPersonal: "Yes" }]).personalIds).toEqual(["P1", "P3", "P6"]);
  });

  it("sums P1 and P3 and their sectors", () => {
    const v = buildPersonalView(
      DEFAULT_REGISTRY,
      { P1, P3 },
      { P1: stmt("P1", [["NVDA", "Information Technology", 600], ["AAPL", "Information Technology", 200]]), P3: stmt("P3", [["BTC", "Crypto", 200]]) },
    );
    expect(v.metrics.invested).toBe(1350);
    expect(v.metrics.value).toBe(1400);
    expect(v.sectors.map((s) => [s.sector, s.share])).toEqual([
      ["Information Technology", 0.8],
      ["Crypto", 0.2],
    ]);
    expect(v.sectorCoverage).toEqual(["P1", "P3"]);
  });
});

describe("journal", () => {
  it("keeps notes tagged with their own portfolio, newest first", () => {
    const j = buildJournal({ registry: DEFAULT_REGISTRY, data: { P1: data("P1", [["2025-01-03", 1, 1, "a"]]), P2: data("P2", [["2025-01-10", 1, 1, "mum"]]) } });
    expect(j.map((e) => [e.portfolioId, e.notes])).toEqual([["P2", "mum"], ["P1", "a"]]);
  });
});
