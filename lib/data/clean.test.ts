import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanRows, excelSerialToIso, parseDate, parseNumber } from "./clean";
import { csvToRawRows, parseCsv } from "./csv";
import type { RawRow } from "./types";

const TODAY = "2026-10-05";
let rowNo = 1;
const raw = (date: unknown, invested: unknown, value: unknown, notes: unknown = ""): RawRow => ({
  date,
  invested,
  value,
  notes,
  row: ++rowNo,
});

describe("parseNumber", () => {
  it.each([
    ["1000", 1000],
    ["21,450.32 USD", 21450.32],
    ["$1,000.50", 1000.5],
    ["USD 500", 500],
    [" 12 000 ", 12000],
    ["(250)", -250],
    ["-75.5", -75.5],
    [1234.5, 1234.5],
  ])("parses %j", (input, expected) => {
    expect(parseNumber(input)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "n/a", "abc", "1.2.3", null, undefined])("rejects %j", (input) => {
    expect(parseNumber(input).ok).toBe(false);
  });

  it("rejects AED amounts rather than guessing", () => {
    const r = parseNumber("3,670 AED");
    expect(r.ok).toBe(false);
  });
});

describe("parseDate", () => {
  it("converts Excel serial numbers (days since 1899-12-30)", () => {
    expect(excelSerialToIso(45658)).toBe("2025-01-01");
    expect(parseDate(45660)).toBe("2025-01-03");
    expect(parseDate("45660")).toBe("2025-01-03");
    expect(parseDate(45660.75)).toBe("2025-01-03"); // time part ignored
    expect(parseDate(60)).toBe("1900-02-28");
  });

  it.each([
    ["2025-01-03", "2025-01-03"],
    ["2025-1-3", "2025-01-03"],
    ["2025-01-03T00:00:00.000Z", "2025-01-03"],
    ["03/01/2025", "2025-01-03"],
    ["3.1.2025", "2025-01-03"],
    ["03 Jan 2025", "2025-01-03"],
    ["3 January 2025", "2025-01-03"],
  ])("parses %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it.each(["", "31/02/2025", "2025-13-01", "yesterday", "123"])("rejects %j", (input) => {
    expect(parseDate(input)).toBeNull();
  });
});

describe("cleanRows", () => {
  it("cleans, sorts and keeps good rows", () => {
    const d = cleanRows("P1", [raw("2025-01-10", "1,000 USD", "$1,050"), raw(45660, "1000", "1000", " Start ")], TODAY);
    expect(d.snapshots).toEqual([
      { date: "2025-01-03", invested: 1000, value: 1000, notes: "Start" },
      { date: "2025-01-10", invested: 1000, value: 1050, notes: "" },
    ]);
    expect(d.issues.map((i) => i.message)).toEqual(["Rows were out of date order and have been sorted"]);
  });

  it("skips rows with missing dates and reports them", () => {
    const d = cleanRows("P1", [raw("", "1000", "1000", "Forgot date")], TODAY);
    expect(d.snapshots).toHaveLength(0);
    expect(d.issues[0]).toMatchObject({ severity: "warning", action: "skipped" });
    expect(d.issues[0]!.message).toContain("Missing date");
  });

  it("ignores completely blank rows silently", () => {
    expect(cleanRows("P1", [raw("", "", "", "")], TODAY).issues).toHaveLength(0);
  });

  it("skips unparseable numbers, future dates and negative values with an error", () => {
    const d = cleanRows(
      "P3",
      [raw("2025-01-03", "500", "n/a"), raw("2027-01-01", "1", "1"), raw("2025-01-10", "1", "-5"), raw("garbage", "1", "1")],
      TODAY,
    );
    expect(d.snapshots).toHaveLength(0);
    expect(d.issues.map((i) => [i.severity, i.action])).toEqual(Array(4).fill(["error", "skipped"]));
  });

  it("de-duplicates dates and says which row was used", () => {
    const d = cleanRows(
      "P1",
      [raw("2025-01-03", "1000", "1000"), raw("2025-01-03", "1000", "1000"), raw("2025-01-10", "1", "1"), raw("2025-01-10", "2", "2")],
      TODAY,
    );
    expect(d.snapshots.map((s) => s.invested)).toEqual([1000, 2]);
    expect(d.issues.filter((i) => i.severity === "info")).toHaveLength(1);
    expect(d.issues.filter((i) => i.severity === "warning")[0]!.message).toContain("different numbers");
  });

  it("flags (keeps) suspicious market moves", () => {
    const d = cleanRows("P3", [raw("2025-01-03", "1000", "1000"), raw("2025-01-10", "1000", "2000")], TODAY);
    expect(d.snapshots).toHaveLength(2);
    expect(d.issues[0]).toMatchObject({ action: "kept", severity: "warning" });
    expect(d.issues[0]!.message).toContain("100%");
  });

  it("flags large capital changes without a note, but not with one", () => {
    const noNote = cleanRows("P1", [raw("2025-01-03", "1000", "1000"), raw("2025-01-10", "6000", "6000")], TODAY);
    expect(noNote.issues[0]!.message).toContain("no note");
    const withNote = cleanRows("P1", [raw("2025-01-03", "1000", "1000"), raw("2025-01-10", "6000", "6000", "Bonus deposit")], TODAY);
    expect(withNote.issues).toHaveLength(0);
  });

  it("doesn't flag small DCA deposits", () => {
    const d = cleanRows("P3", [raw("2025-01-03", "500", "500"), raw("2025-01-10", "650", "650")], TODAY);
    expect(d.issues).toHaveLength(0);
  });
});

describe("CSV", () => {
  it("parses quoted fields and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("maps headers by name", () => {
    const rows = csvToRawRows("Notes,Value (USD),Date,Invested (USD)\nhello,10,2025-01-03,5\n");
    expect(rows).toEqual([{ date: "2025-01-03", invested: "5", value: "10", notes: "hello", row: 2 }]);
  });

  it("cleans the bundled sample files and reports their planted issues", () => {
    for (const [id, file] of [["P1", "p1.csv"], ["P2", "p2.csv"], ["P3", "p3.csv"], ["P5", "p5.csv"]] as const) {
      const text = readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8");
      const d = cleanRows(id, csvToRawRows(text), TODAY);
      expect(d.snapshots.length).toBeGreaterThan(50);
      for (let i = 1; i < d.snapshots.length; i++) expect(d.snapshots[i]!.date > d.snapshots[i - 1]!.date).toBe(true);
      if (id === "P1") {
        expect(d.issues.some((i) => i.message.includes("Missing date"))).toBe(true);
        expect(d.issues.some((i) => i.message.includes("Duplicate"))).toBe(true);
      }
      if (id === "P3") expect(d.issues.some((i) => i.message.includes("Value"))).toBe(true);
    }
  });
});
