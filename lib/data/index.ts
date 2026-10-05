import "server-only";
import { cache } from "react";
import { buildRegistry } from "@/config/portfolios";
import { requireSession } from "@/lib/auth";
import { todayIso } from "@/lib/format";
import { latestStatements, parseStatements } from "@/lib/holdings";
import { createAppsScriptSource } from "./apps-script-source";
import { cleanRows } from "./clean";
import { createCsvSource } from "./csv-source";
import type { DataSource, LoadResult, RawLoad } from "./types";

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

/** Pure part of loading: registry + cleaning + statements. Exported for tests. */
export function assemble(raw: RawLoad, today: string, source: string): LoadResult {
  const registry = buildRegistry(raw.registry ?? []);
  const data: LoadResult["data"] = {};
  for (const p of registry.list) data[p.id] = cleanRows(p.id, raw.rows[p.id] ?? [], today);
  const registryIssues = registry.issues.map((message) => ({ portfolioId: "Portfolios tab", severity: "warning" as const, action: "kept" as const, message }));
  const known = new Set(registry.list.map((p) => p.id));
  const statements = latestStatements(parseStatements(raw.statements, raw.holdings).filter((s) => known.has(s.portfolioId)));
  return { registry, registryIssues, data, statements, fetchedAt: raw.fetchedAt, staleReason: raw.staleReason, source };
}

/** Load and clean everything once per request. Requires a valid session. */
export const loadData = cache(async (): Promise<LoadResult> => {
  await requireSession();
  const source = getDataSource();
  return assemble(await source.loadRaw(), todayIso(), source.kind);
});
