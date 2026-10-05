import "server-only";
import { isPortfolioId, type PortfolioId } from "@/config/portfolios";
import type { DataSource, NewEntry, RawRow } from "./types";

/**
 * Phase 2: live data from the Google Sheet through an Apps Script web app
 * (see /apps-script). Runs on the server only — the token never reaches the browser.
 * The token goes in the POST body (not the URL) so it never lands in request logs.
 */

const CACHE_TTL_MS = 60_000;
const TIMEOUT_MS = 15_000;

interface ListResponse {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  portfolios?: Record<string, { date: unknown; invested: unknown; value: unknown; notes: unknown; row?: unknown }[]>;
}

type Loaded = Awaited<ReturnType<DataSource["loadRaw"]>>;
let cache: { at: number; data: Loaded } | null = null;

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
      throw new Error("Apps Script returned non-JSON (check the deployment URL and access settings)");
    }
    if (!json.ok) throw new Error(json.error ?? "Apps Script returned an error");
    return json;
  }

  return {
    kind: "apps-script",
    async loadRaw() {
      if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
      try {
        const json = await call<ListResponse>({ action: "list" });
        const rows: Partial<Record<PortfolioId, RawRow[]>> = {};
        for (const [id, list] of Object.entries(json.portfolios ?? {})) {
          if (!isPortfolioId(id) || !Array.isArray(list)) continue;
          rows[id] = list.map((r, i) => ({
            date: r.date,
            invested: r.invested,
            value: r.value,
            notes: r.notes,
            row: typeof r.row === "number" ? r.row : i + 2,
          }));
        }
        const data: Loaded = { rows, fetchedAt: json.generatedAt ?? new Date().toISOString() };
        cache = { at: Date.now(), data };
        return data;
      } catch (err) {
        // Serve the last good copy (clearly labelled) rather than an empty dashboard.
        if (cache) return { ...cache.data, staleReason: `Live data unavailable: ${(err as Error).message}` };
        throw err;
      }
    },
    async addEntry(entry: NewEntry) {
      await call({ action: "add", entry });
      cache = null;
    },
  };
}
