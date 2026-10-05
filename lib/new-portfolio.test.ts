import { describe, expect, it } from "vitest";
import { validateNewPortfolio } from "./new-portfolio";

describe("validateNewPortfolio", () => {
  it("creates a personal portfolio, opted out of Personal by default", () => {
    const r = validateNewPortfolio({ name: "Gold: bars/coins", ownership: "personal" }, "P6", "--chart-6");
    expect(r).toMatchObject({ ok: true, tab: "P6 Gold bars coins", portfolio: { id: "P6", includeInPersonal: false, ownership: "personal", shortName: "Gold: bars/coins" } });
  });

  it("opts in only when asked and active", () => {
    expect(validateNewPortfolio({ name: "Gold", ownership: "personal", includeInPersonal: "on" }, "P6", "c")).toMatchObject({ portfolio: { includeInPersonal: true } });
    expect(validateNewPortfolio({ name: "Gold", ownership: "personal", includeInPersonal: "on", status: "planned" }, "P6", "c")).toMatchObject({ portfolio: { includeInPersonal: false } });
  });

  it("never puts managed money in Personal", () => {
    const r = validateNewPortfolio({ name: "Dad", ownership: "managed", managedFor: "Dad", includeInPersonal: "on" }, "P6", "c");
    expect(r).toMatchObject({ ok: true, portfolio: { ownership: "managed", includeInPersonal: false, managedFor: "Dad" } });
  });

  it("requires a name, an owner choice and who it's managed for", () => {
    const r = validateNewPortfolio({ ownership: "managed" }, "P6", "c");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["managedFor", "name"]);
    expect(validateNewPortfolio({ name: "X" }, "P6", "c").ok).toBe(false);
  });
});
