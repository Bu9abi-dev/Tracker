import "server-only";
import type { RegistryRow } from "@/config/portfolios";
import type { DataSource, NewEntry, NewPortfolio, RawLoad, RawRow, Statement } from "./types";

/**
 * Phase 2: live data from the Google Sheet through an Apps Script web app
 * (see /apps-script). Runs on the server only — the token never reaches the browser.
 * The token goes in the POST body (not the URL) so it never lands in request logs.
 */

const CACHE_TTL_MS = 60_000;
const TIMEOUT_MS = 20_000;

interface ListResponse {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  registry?: RegistryRow[];
  portfolios?: Record<string, { date: unknown; invested: unknown; value: unknown; notes: unknown; row?: unknown }[]>;
  statements?: unknown[];
  holdings?: unknown[];
}

let cache: { at: number; data: RawLoad } | null = null;

/** Turns low-level failures into messages a person can act on. */
function friendly(err: unknown): Error {
  const msg = (err as Error)?.message ?? String(err);
  if (/timeout|aborted/i.test(msg)) return new Error("Your Google Sheet took too long to answer. Try again in a moment.");
  if (/Unauthorized/.test(msg)) return new Error("The Sheet rejected the app's token. Check APPS_SCRIPT_TOKEN matches the Sheet's API_TOKEN.");
  if (/Unknown action/.test(msg)) {
    return new Error("Your Apps Script is out of date. In Apps Script: Deploy → Manage deployments → Edit → Version: New version → Deploy.");
  }
  return err instanceof Error ? err : new Error(msg);
}

export function createAppsScriptSource(url: string, token: string): DataSource {
  async function call<T extends { ok: boolean; error?: string }>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight on Apps Script
      body: JSON.stringify({ ...body, token }),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Apps Script responded ${res.status}`);
    const text = await res.text();
    let json: T;
    try {
      json = JSON.parse(text) as T;
    } catch {
      throw new Error("Apps Script returned a web page instead of data. Check the deployment URL and that access is set to Anyone.");
    }
    if (!json.ok) throw new Error(json.error ?? "Apps Script returned an error");
    return json;
  }

  return {
    kind: "apps-script",
    writable: true,
    async loadRaw() {
      if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
      try {
        const json = await call<ListResponse>({ action: "list" });
        const rows: Record<string, RawRow[]> = {};
        for (const [id, list] of Object.entries(json.portfolios ?? {})) {
          if (!Array.isArray(list)) continue;
          rows[id.toUpperCase()] = list.map((r, i) => ({
            date: r.date,
            invested: r.invested,
            value: r.value,
            notes: r.notes,
            row: typeof r.row === "number" ? r.row : i + 2,
          }));
        }
        const data: RawLoad = {
          rows,
          registry: Array.isArray(json.registry) ? json.registry : [],
          statements: Array.isArray(json.statements) ? json.statements : [],
          holdings: Array.isArray(json.holdings) ? json.holdings : [],
          fetchedAt: json.generatedAt ?? new Date().toISOString(),
        };
        cache = { at: Date.now(), data };
        return data;
      } catch (err) {
        const e = friendly(err);
        // Serve the last good copy (clearly labelled) rather than an empty dashboard.
        if (cache) return { ...cache.data, staleReason: `Live data unavailable: ${e.message}` };
        throw e;
      }
    },
    async addEntry(entry: NewEntry) {
      await call({ action: "add", entry }).catch((e) => Promise.reject(friendly(e)));
      cache = null;
    },
    async createPortfolio(portfolio: NewPortfolio, tab: string) {
      await call({ action: "createPortfolio", portfolio: { ...portfolio, tab } }).catch((e) => Promise.reject(friendly(e)));
      cache = null;
    },
    async saveStatement(statement: Statement) {
      await call({ action: "saveStatement", statement }).catch((e) => Promise.reject(friendly(e)));
      cache = null;
    },
  };
}
