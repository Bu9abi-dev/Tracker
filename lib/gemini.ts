import "server-only";
import { ASSET_TYPES, SECTORS } from "./data/types";
import { normalizeAssetType, normalizeSector, type Draft } from "./holdings";

/**
 * Reads an account statement with Google Gemini (free tier) and returns a draft
 * of the holdings for the person to review. Nothing is saved here.
 *
 * Privacy: on Gemini's free tier Google may use what you send to improve its
 * products. The owner chose this knowingly; the upload page repeats the warning.
 */

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel accepts ~4.5 MB per request
export const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "application/pdf",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
  "image/heic": "image/heic",
  "image/heif": "image/heif",
  "text/csv": "text/plain",
  "text/plain": "text/plain",
  "application/vnd.ms-excel": "text/plain", // .csv on some phones
};

const SYSTEM = `You extract investment holdings from brokerage and crypto exchange account statements.
Return ONLY data that is printed in the document. Never guess or invent numbers.
- One entry per position (stock, ETF, fund, bond, crypto coin, option). Include each cash balance as its own entry with assetType "cash" and sector "Cash".
- Use the statement's base/reporting currency for every money value, and report that currency code in "currency".
- value = market value of the position. costBasis = total cost of the position if printed, else null. price = per-unit price if printed, else null. quantity = units held if printed, else null.
- reportedTotal = the total account / net asset value printed on the statement, else null.
- sector: pick the closest from the allowed list (GICS sectors for stocks; "Diversified (ETF/Fund)" for broad ETFs/funds; "Crypto" for crypto; "Cash" for cash; "Bonds" for bonds).
- statementDate: the "as of" / period end date, formatted YYYY-MM-DD.
- accountLast4: ONLY the last 4 characters of the account number (never the full number). accountHolder: the account holder's name as printed.
- Put anything uncertain (unreadable rows, missing totals, multiple accounts) in "warnings".`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    broker: { type: "STRING" },
    accountLast4: { type: "STRING" },
    accountHolder: { type: "STRING" },
    statementDate: { type: "STRING" },
    currency: { type: "STRING" },
    reportedTotal: { type: "NUMBER", nullable: true },
    holdings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          symbol: { type: "STRING" },
          name: { type: "STRING" },
          assetType: { type: "STRING", enum: [...ASSET_TYPES] },
          sector: { type: "STRING", enum: [...SECTORS] },
          quantity: { type: "NUMBER", nullable: true },
          price: { type: "NUMBER", nullable: true },
          value: { type: "NUMBER" },
          costBasis: { type: "NUMBER", nullable: true },
        },
        required: ["symbol", "name", "assetType", "sector", "value"],
      },
    },
    warnings: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["broker", "statementDate", "currency", "holdings", "warnings"],
};

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}

export function geminiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.GEMINI_API_KEY;
}

function explain(status: number, body: string, model: string): string {
  if (status === 429) return "Gemini's free limit is used up for now. Wait a minute (or until tomorrow) and try again.";
  if (status === 400 && /location|region|country/i.test(body)) return "Gemini's free tier isn't available in your region from this server.";
  if (status === 400 && /API key/i.test(body)) return "The Gemini API key isn't valid. Check GEMINI_API_KEY in Vercel.";
  if (status === 403) return "The Gemini API key doesn't have access. Check GEMINI_API_KEY in Vercel.";
  if (status === 404) return `Gemini model "${model}" wasn't found. Set GEMINI_MODEL in Vercel to a current model (see README).`;
  if (status === 413) return "The file is too large for Gemini.";
  if (status >= 500) return "Gemini is having trouble right now. Try again in a few minutes.";
  return `Gemini returned an error (${status}).`;
}

export interface ExtractInput {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  /** What the person typed, e.g. "this is my IBKR statement for P1, ignore the options". */
  prompt: string;
  portfolioName: string;
}

export async function extractStatement(input: ExtractInput, env: Record<string, string | undefined> = process.env): Promise<Draft> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("Statement reading isn't set up yet: add GEMINI_API_KEY in Vercel (see README).");
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const base = env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";
  const mimeType = SUPPORTED_TYPES[input.mimeType];
  if (!mimeType) throw new GeminiError("Upload a PDF, a photo/screenshot (PNG, JPG, HEIC) or a CSV file.");

  const filePart =
    mimeType === "text/plain"
      ? { text: `File "${input.fileName}" contents:\n${new TextDecoder().decode(input.bytes)}` }
      : { inlineData: { mimeType, data: Buffer.from(input.bytes).toString("base64") } };

  const userText = [
    `This statement is for the portfolio "${input.portfolioName}".`,
    input.prompt.trim() ? `Notes from the owner: ${input.prompt.trim().slice(0, 1000)}` : "",
    "Extract the holdings as JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [filePart, { text: userText }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new GeminiError(/timeout|abort/i.test(String(err)) ? "Gemini took too long. Try again, or upload a shorter statement (fewer pages)." : "Couldn't reach Gemini. Check your connection and try again.");
  }
  const text = await res.text();
  if (!res.ok) throw new GeminiError(explain(res.status, text, model));
  return parseGeminiResponse(text);
}

/** Pull the JSON draft out of a Gemini generateContent response. Exported for tests. */
export function parseGeminiResponse(text: string): Draft {
  let outer: { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  try {
    outer = JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini sent back something unreadable. Try again.");
  }
  if (outer.promptFeedback?.blockReason) throw new GeminiError(`Gemini refused to read this file (${outer.promptFeedback.blockReason}).`);
  const part = outer.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!part) throw new GeminiError("Gemini didn't find anything in this file. Is it the right statement?");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(part);
  } catch {
    throw new GeminiError("Gemini's answer was cut off — try a shorter statement (fewer pages).");
  }
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const holdings = Array.isArray(raw.holdings) ? (raw.holdings as Record<string, unknown>[]) : [];
  return {
    broker: s(raw.broker),
    accountLast4: s(raw.accountLast4).slice(-4),
    accountHolder: s(raw.accountHolder),
    statementDate: s(raw.statementDate),
    currency: s(raw.currency).toUpperCase() || "USD",
    reportedTotal: n(raw.reportedTotal),
    holdings: holdings
      .map((h) => ({
        symbol: s(h.symbol).toUpperCase(),
        name: s(h.name),
        assetType: normalizeAssetType(h.assetType),
        sector: normalizeSector(h.sector),
        quantity: n(h.quantity),
        price: n(h.price),
        value: n(h.value) ?? Number.NaN,
        costBasis: n(h.costBasis),
      }))
      .filter((h) => h.symbol || h.name),
    warnings: Array.isArray(raw.warnings) ? (raw.warnings as unknown[]).map(s).filter(Boolean) : [],
  };
}
