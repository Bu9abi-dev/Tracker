import "server-only";
import { cache } from "react";
import { PORTFOLIOS } from "@/config/portfolios";
import { requireSession } from "@/lib/auth";
import { todayIso } from "@/lib/format";
import { createAppsScriptSource } from "./apps-script-source";
import { cleanRows } from "./clean";
import { createCsvSource } from "./csv-source";
import type { DataSource, LoadResult } from "./types";

export function getDataSource(env: Record<string, string | undefined> = process.env): DataSource {
  const kind = env.DATA_SOURCE ?? "csv";
  if (kind === "apps-script") {
    const url = env.APPS_SCRIPT_URL;
    const token = env.APPS_SCRIPT_TOKEN;
    if (!url || !token) throw new Error("DATA_SOURCE=apps-script needs APPS_SCRIPT_URL and APPS_SCRIPT_TOKEN");
    return createAppsScriptSource(url, token);
  }
  if (kind === "csv") return createCsvSource();
  throw new Error(`Unknown DATA_SOURCE "${kind}" (use "csv" or "apps-script")`);
}

/** Load and clean every portfolio once per request. Requires a valid session. */
export const loadData = cache(async (): Promise<LoadResult> => {
  await requireSession();
  const source = getDataSource();
  const raw = await source.loadRaw();
  const today = todayIso();
  const portfolios: LoadResult["portfolios"] = {};
  for (const p of PORTFOLIOS) {
    portfolios[p.id] = cleanRows(p.id, raw.rows[p.id] ?? [], today);
  }
  return { portfolios, fetchedAt: raw.fetchedAt, staleReason: raw.staleReason };
});
