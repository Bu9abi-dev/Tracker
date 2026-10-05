import { describe, expect, it } from "vitest";
import { accountHint, checkDraft, checkIdentity, draftToStatement, latestStatements, normalizeSector, parseStatements, type Draft } from "./holdings";
import { holdingsSummary, sectorAllocation } from "./calculations";

const TODAY = "2026-10-05";
const draft = (over: Partial<Draft> = {}): Draft => ({
  broker: "Interactive Brokers",
  accountLast4: "1234",
  accountHolder: "A",
  statementDate: "2026-09-30",
  currency: "USD",
  reportedTotal: 1500,
  holdings: [
    { symbol: "NVDA", name: "NVIDIA", assetType: "stock", sector: "Information Technology", quantity: 5, price: 200, value: 1000, costBasis: 800 },
    { symbol: "USD", name: "Cash", assetType: "cash", sector: "Cash", quantity: null, price: null, value: 500, costBasis: null },
  ],
  warnings: [],
  ...over,
});

describe("checkDraft", () => {
  it("passes a consistent statement", () => {
    const c = checkDraft(draft(), TODAY);
    expect(c).toMatchObject({ ok: true, blocking: [], totalProblem: null, holdingsTotal: 1500 });
  });

  it("blocks a row where quantity × price doesn't match value until it's checked", () => {
    const d = draft();
    d.holdings[0]!.value = 1100;
    d.reportedTotal = 1600;
    const c = checkDraft(d, TODAY);
    expect(c.ok).toBe(false);
    expect(c.rowProblems[0]).toMatch(/1000.00/);
    d.holdings[0]!.checked = true;
    expect(checkDraft(d, TODAY).ok).toBe(true);
  });

  it("blocks when holdings don't add up to the statement total until confirmed", () => {
    const d = draft({ reportedTotal: 1600 });
    const c = checkDraft(d, TODAY);
    expect(c.totalProblem).toMatch(/1500.00/);
    expect(c.ok).toBe(false);
    expect(checkDraft({ ...d, totalChecked: true }, TODAY).ok).toBe(true);
  });

  it("allows a tiny rounding difference", () => {
    expect(checkDraft(draft({ reportedTotal: 1500.9 }), TODAY).ok).toBe(true);
  });

  it("hard-blocks unsupported currency, missing date and bad values", () => {
    const d = draft({ currency: "EUR", statementDate: "" });
    d.holdings[1]!.value = Number.NaN;
    const c = checkDraft(d, TODAY);
    expect(c.blocking).toHaveLength(3);
    expect(checkDraft({ ...d, totalChecked: true }, TODAY).ok).toBe(false);
    expect(checkDraft(draft({ statementDate: "2026-12-01" }), TODAY).blocking[0]).toMatch(/future/);
  });
});

describe("draftToStatement", () => {
  it("converts AED statements to USD at 3.67", () => {
    const s = draftToStatement(
      draft({ currency: "AED", reportedTotal: 367, holdings: [{ symbol: "X", name: "X", assetType: "stock", sector: "Energy", quantity: 1, price: 367, value: 367, costBasis: 183.5 }] }),
      { id: "s1", portfolioId: "P2", fileName: "f.pdf", savedAt: "t" },
    );
    expect(s.reportedTotalUsd).toBe(100);
    expect(s.holdings[0]).toMatchObject({ valueUsd: 100, priceUsd: 100, costBasisUsd: 50 });
    expect(s.accountHint).toBe("Interactive Brokers …1234");
  });
});

describe("identity check", () => {
  const others = [
    { id: "P1", name: "Active", accountHint: "IBKR …1234" },
    { id: "P2", name: "Mother's House", accountHint: "Sarwa …9876" },
  ];
  it("warns when a statement looks like another portfolio's (e.g. Mother's)", () => {
    const c = checkIdentity("Sarwa …9876", { id: "P1", accountHint: "IBKR …1234" }, others);
    expect(c.looksLike).toMatch(/P2/);
    expect(c.mismatch).toMatch(/IBKR/);
  });
  it("is quiet when it matches", () => {
    expect(checkIdentity("IBKR …1234", others[0]!, others)).toEqual({ mismatch: null, looksLike: null });
  });
  it("is quiet for a first statement", () => {
    expect(checkIdentity("OKX …5555", { id: "P3" }, others)).toEqual({ mismatch: null, looksLike: null });
  });
  it("builds hints from broker and last 4 digits only", () => {
    expect(accountHint("OKX", "U12345678")).toBe("OKX …5678");
    expect(accountHint("OKX", "")).toBe("OKX");
  });
});

describe("statements from the sheet", () => {
  it("joins holdings to statements and picks the latest per portfolio", () => {
    const statements = [
      { id: "a", portfolioId: "p1", statementDate: "2026-08-31", savedAt: "1", fileName: "aug.pdf", reportedTotalUsd: "" },
      { id: "b", portfolioId: "P1", statementDate: "2026-09-30", savedAt: "2", fileName: "sep.pdf", reportedTotalUsd: 1000 },
      { id: "c", portfolioId: "P3", statementDate: "bad", savedAt: "3" },
    ];
    const holdings = [
      { statementId: "a", symbol: "OLD", valueUsd: 1 },
      { statementId: "b", symbol: "NVDA", sector: "tech", assetType: "stock", valueUsd: "900", costBasisUsd: "" },
      { statementId: "b", symbol: "CASH", sector: "Cash", assetType: "cash", valueUsd: 100 },
    ];
    const latest = latestStatements(parseStatements(statements, holdings));
    expect(Object.keys(latest)).toEqual(["P1"]);
    expect(latest.P1!.fileName).toBe("sep.pdf");
    expect(latest.P1!.holdings.map((h) => [h.symbol, h.sector, h.valueUsd, h.costBasisUsd])).toEqual([
      ["NVDA", "Information Technology", 900, null],
      ["CASH", "Cash", 100, null],
    ]);
  });

  it("maps free-text sectors onto the fixed list", () => {
    expect(normalizeSector("Semiconductors")).toBe("Information Technology");
    expect(normalizeSector("Bitcoin")).toBe("Crypto");
    expect(normalizeSector("Health Care")).toBe("Health Care");
    expect(normalizeSector("???")).toBe("Other");
  });
});

describe("holdings maths", () => {
  const h = (symbol: string, sector: string, valueUsd: number, costBasisUsd: number | null) => ({ symbol, name: symbol, sector, valueUsd, costBasisUsd });

  it("computes weights and P&L only where cost is known", () => {
    const s = holdingsSummary([h("A", "Energy", 300, 200), h("B", "Energy", 100, null), h("C", "Crypto", 600, 800)]);
    expect(s.totalValue).toBe(1000);
    expect(s.rows.map((r) => [r.holding.symbol, r.weight, r.pnl])).toEqual([
      ["C", 0.6, -200],
      ["A", 0.3, 100],
      ["B", 0.1, null],
    ]);
    expect(s.pnl).toBe(-100);
    expect(s.pnlPct).toBeCloseTo(-100 / 1000, 12);
    expect(s.positionsWithCost).toBe(2);
  });

  it("returns null P&L when no position has a cost", () => {
    expect(holdingsSummary([h("A", "Crypto", 10, null)]).pnl).toBeNull();
  });

  it("groups by sector, largest first", () => {
    expect(sectorAllocation([h("A", "Energy", 300, null), h("B", "Crypto", 600, null), h("C", "Energy", 100, null), h("Z", "Cash", 0, null)])).toEqual([
      { sector: "Crypto", value: 600, positions: 1, share: 0.6 },
      { sector: "Energy", value: 400, positions: 2, share: 0.4 },
    ]);
  });
});

describe("loading", () => {
  it("assembles registry, data and statements, ignoring statements for unknown portfolios", async () => {
    const { assemble } = await import("./data/index");
    const r = assemble(
      {
        rows: { P1: [{ date: "2026-10-04", invested: "1,000 USD", value: 1100, notes: "", row: 4 }], P6: [] },
        registry: [{ id: "P6", name: "Gold", status: "active" }, { id: "P2", ownership: "personal" }],
        statements: [{ id: "s1", portfolioId: "P1", statementDate: "2026-10-03" }, { id: "s2", portfolioId: "ZZ", statementDate: "2026-10-03" }],
        holdings: [{ statementId: "s1", symbol: "A", valueUsd: 5 }],
        fetchedAt: "t",
      },
      "2026-10-05",
      "apps-script",
    );
    expect(r.data.P1!.snapshots).toEqual([{ date: "2026-10-04", invested: 1000, value: 1100, notes: "" }]);
    expect(r.data.P6!.snapshots).toEqual([]);
    expect(Object.keys(r.statements)).toEqual(["P1"]);
    expect(r.registry.personalIds).toEqual(["P1", "P3"]);
    expect(r.registryIssues[0]!.message).toMatch(/P2 is managed/);
  });
});
