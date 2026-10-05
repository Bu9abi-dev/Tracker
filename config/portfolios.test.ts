import { describe, expect, it } from "vitest";
import { ALWAYS_MANAGED, DEFAULT_REGISTRY, buildRegistry, findPortfolio, nextPortfolioId } from "./portfolios";

describe("registry", () => {
  it("has the default portfolios with the user's sheet tab names", () => {
    expect(DEFAULT_REGISTRY.list.map((p) => [p.id, p.tab])).toEqual([
      ["P1", "P1 (STOCKS ONLY IBKR)"],
      ["P2", "P2 HOUSE"],
      ["P3", "P3 Crypto (OKX)"],
      ["P4", "P4"],
      ["P5", "P5"],
    ]);
    expect([...ALWAYS_MANAGED]).toEqual(["P2"]);
  });

  it("merges sheet rows over defaults and appends new ones", () => {
    const r = buildRegistry([
      { id: "p1", name: "Stocks", tab: "P1 tab" },
      { id: "P6", name: "Gold", shortName: "", status: "planned", ownership: "Personal" },
    ]);
    expect(findPortfolio(r, "P1")).toMatchObject({ name: "Stocks", tab: "P1 tab", includeInPersonal: true });
    expect(findPortfolio(r, "p6")).toMatchObject({ name: "Gold", shortName: "Gold", status: "planned", ownership: "personal", tab: "P6" });
    expect(r.list.at(-1)?.id).toBe("P6");
  });

  it("never lets a planned or archived portfolio into Personal", () => {
    const r = buildRegistry([{ id: "P5", includeInPersonal: true }]);
    expect(r.personalIds).toEqual(["P1", "P3"]);
    expect(r.issues[0]).toMatch(/archived/);
  });

  it("reports bad ids and statuses", () => {
    const r = buildRegistry([{ id: "bad id!" }, { id: "P7", status: "sleeping" }]);
    expect(r.issues).toHaveLength(2);
    expect(findPortfolio(r, "P7")?.status).toBe("active");
  });

  it("suggests the next id", () => {
    expect(nextPortfolioId(DEFAULT_REGISTRY)).toBe("P6");
    expect(nextPortfolioId(buildRegistry([{ id: "P9" }]))).toBe("P10");
  });
});
