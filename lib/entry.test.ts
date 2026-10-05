import { describe, expect, it } from "vitest";
import { validateEntry, WRITABLE_IDS } from "./entry";

const base = { id: "abcdef12-3456", date: "2026-10-02", portfolioId: "P1", invested: "56,450", value: "58,386.47 USD", notes: " Weekly check " };

describe("validateEntry", () => {
  it("accepts and normalises a valid entry", () => {
    const r = validateEntry(base, "2026-10-05");
    expect(r).toEqual({
      ok: true,
      entry: { id: "abcdef12-3456", portfolioId: "P1", date: "2026-10-02", invested: 56450, value: 58386.47, notes: "Weekly check" },
    });
  });

  it("only allows active portfolios", () => {
    expect(WRITABLE_IDS).toEqual(["P1", "P2", "P3"]);
    expect(validateEntry({ ...base, portfolioId: "P5" }, "2026-10-05").ok).toBe(false);
    expect(validateEntry({ ...base, portfolioId: "PX" }, "2026-10-05").ok).toBe(false);
  });

  it("rejects bad numbers, dates and long notes", () => {
    const r = validateEntry({ ...base, invested: "abc", value: "-1", date: "2026-10-06", notes: "x".repeat(501), id: "" }, "2026-10-05");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["date", "id", "invested", "notes", "value"]);
  });
});
