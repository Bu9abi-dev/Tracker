import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PORTFOLIOS, type PortfolioId } from "@/config/portfolios";
import { csvToRawRows } from "./csv";
import type { DataSource, RawRow } from "./types";

export class ReadOnlySourceError extends Error {
  constructor() {
    super("The CSV data source is read-only. Set DATA_SOURCE=apps-script to add entries to your Google Sheet.");
    this.name = "ReadOnlySourceError";
  }
}

/** Phase 1: one CSV per portfolio in /data. A missing file means "no data yet". */
export function createCsvSource(dir = path.join(process.cwd(), "data")): DataSource {
  return {
    kind: "csv",
    async loadRaw() {
      const rows: Partial<Record<PortfolioId, RawRow[]>> = {};
      await Promise.all(
        PORTFOLIOS.map(async (p) => {
          try {
            rows[p.id] = csvToRawRows(await readFile(path.join(dir, p.source.csv), "utf8"));
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          }
        }),
      );
      return { rows, fetchedAt: new Date().toISOString() };
    },
    async addEntry() {
      throw new ReadOnlySourceError();
    },
  };
}
