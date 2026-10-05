import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatTime, todayIso } from "./format";

describe("format", () => {
  it("formats dates as DD MMM YYYY without time-zone shifts", () => {
    expect(formatDate("2025-01-03")).toBe("03 Jan 2025");
    expect(formatDate("2026-12-31")).toBe("31 Dec 2026");
    expect(formatDate(null)).toBe("—");
  });

  it("formats times on a 12-hour clock in Dubai time", () => {
    expect(formatTime("2026-10-05T11:45:00Z")).toBe("3:45 PM");
    expect(formatTime("2026-10-05T20:05:00Z")).toBe("12:05 AM");
    expect(formatDateTime("2026-10-05T20:05:00Z")).toBe("06 Oct 2026, 12:05 AM");
    expect(todayIso(new Date("2026-10-05T21:00:00Z"))).toBe("2026-10-06");
  });

  it("formats money in USD and AED", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,235");
    expect(formatMoney(1234.5, "USD", { decimals: 2 })).toBe("$1,234.50");
    expect(formatMoney(1000, "AED")).toBe("AED 3,670");
    expect(formatMoney(-250, "USD", { signed: true })).toBe("−$250");
    expect(formatMoney(250, "AED", { signed: true })).toBe("+AED 918");
    expect(formatMoney(0.2, "USD", { signed: true })).toBe("$0");
    expect(formatMoney(54321, "USD", { compact: true })).toBe("$54.3K");
  });

  it("formats percentages with sign", () => {
    expect(formatPercent(0.123456)).toBe("+12.35%");
    expect(formatPercent(-0.05)).toBe("−5.00%");
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatPercent(null)).toBe("—");
  });
});
