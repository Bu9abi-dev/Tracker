import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_PORTFOLIOS } from "@/config/portfolios";
import { csvToRawRows } from "./csv";
import type { DataSource, RawRow } from "./types";

export class ReadOnlySourceError extends Error {
  constructor(what = "Saving") {
    super(`${what} needs your Google Sheet to be connected. The app is currently showing sample data from CSV files.`);
    this.name = "ReadOnlySourceError";
  }
}

/** Phase 1: one CSV per portfolio in /data (sample data). A missing file means "no data yet". */
export function createCsvSource(dir = path.join(process.cwd(), "data")): DataSource {
  return {
    kind: "csv",
    writable: false,
    async loadRaw() {
      const rows: Record<string, RawRow[]> = {};
      await Promise.all(
        DEFAULT_PORTFOLIOS.map(async (p) => {
          if (!p.csv) return;
          try {
            rows[p.id] = csvToRawRows(await readFile(path.join(dir, p.csv), "utf8"));
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          }
        }),
      );
      return { rows, fetchedAt: new Date().toISOString() };
    },
    async addEntry() {
      throw new ReadOnlySourceError("Adding entries");
    },
    async createPortfolio() {
      throw new ReadOnlySourceError("Adding portfolios");
    },
    async saveStatement() {
      throw new ReadOnlySourceError("Saving statements");
    },
  };
}
