import type { RawRow } from "./types";

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const COLUMN_MATCHERS = {
  date: /^date/i,
  invested: /^invested/i,
  value: /^(current\s+)?value/i,
  notes: /^notes?/i,
} as const;

/** CSV text with a header row (Date, Invested (USD), Value (USD), Notes) → raw rows. */
export function csvToRawRows(text: string): RawRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const index = Object.fromEntries(
    Object.entries(COLUMN_MATCHERS).map(([key, re]) => [key, header.findIndex((h) => re.test(h.trim()))]),
  ) as Record<keyof typeof COLUMN_MATCHERS, number>;
  if (index.date < 0 || index.invested < 0 || index.value < 0) {
    throw new Error(`CSV header must include Date, Invested and Value columns (got: ${header.join(", ")})`);
  }
  const at = (r: string[], i: number) => (i >= 0 ? r[i] : undefined);
  return body.map((r, i) => ({
    date: at(r, index.date),
    invested: at(r, index.invested),
    value: at(r, index.value),
    notes: at(r, index.notes),
    row: i + 2,
  }));
}
