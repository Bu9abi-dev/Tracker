import { describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, readAuthConfig, safeNextPath, verifySessionToken } from "./session";

const config = { password: "correct horse battery", secret: "s".repeat(32) };

describe("session tokens", () => {
  it("round-trips and expires", () => {
    const now = Date.UTC(2026, 9, 5);
    const token = createSessionToken(config, now);
    expect(verifySessionToken(token, config, now + 1000)).toBe(true);
    expect(verifySessionToken(token, config, now + 31 * 86_400_000)).toBe(false);
  });

  it("rejects tampering and rotated secrets or passwords", () => {
    const token = createSessionToken(config);
    const [exp, mac] = token.split(".");
    expect(verifySessionToken(`${Number(exp) + 1}.${mac}`, config)).toBe(false);
    expect(verifySessionToken(`${token}x`, config)).toBe(false);
    expect(verifySessionToken(token, { ...config, secret: "t".repeat(32) })).toBe(false);
    expect(verifySessionToken(token, { ...config, password: "another long password" })).toBe(false);
    expect(verifySessionToken(undefined, config)).toBe(false);
    expect(verifySessionToken("a.b.c", config)).toBe(false);
  });

  it("checks passwords exactly", () => {
    expect(checkPassword("correct horse battery", config)).toBe(true);
    expect(checkPassword("correct horse batter", config)).toBe(false);
    expect(checkPassword("", config)).toBe(false);
  });

  it("requires strong configuration", () => {
    expect(readAuthConfig({}).ok).toBe(false);
    expect(readAuthConfig({ DASHBOARD_PASSWORD: "short", SESSION_SECRET: "s".repeat(32) }).ok).toBe(false);
    expect(readAuthConfig({ DASHBOARD_PASSWORD: "long enough password", SESSION_SECRET: "short" }).ok).toBe(false);
    expect(readAuthConfig({ DASHBOARD_PASSWORD: "long enough password", SESSION_SECRET: "s".repeat(32) }).ok).toBe(true);
  });

  it("only redirects to same-site paths", () => {
    expect(safeNextPath("/p/P1")).toBe("/p/P1");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });
});
