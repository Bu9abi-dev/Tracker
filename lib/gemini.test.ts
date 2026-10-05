import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiError, extractStatement, parseGeminiResponse } from "./gemini";

const wrap = (obj: unknown) => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const input = { bytes: new TextEncoder().encode("%PDF"), mimeType: "application/pdf", fileName: "s.pdf", prompt: "for P1", portfolioName: "Active" };

afterEach(() => vi.unstubAllGlobals());

describe("Gemini response parsing", () => {
  it("normalises the draft", () => {
    const d = parseGeminiResponse(
      wrap({
        broker: "IBKR",
        accountLast4: "U1234567",
        statementDate: "2026-09-30",
        currency: "usd",
        reportedTotal: 10,
        holdings: [{ symbol: "nvda", name: "NVIDIA", assetType: "Stock", sector: "semiconductors", value: 10, quantity: 1, price: 10 }, { symbol: "", name: "" }],
        warnings: ["page 3 blurry", 5],
      }),
    );
    expect(d.accountLast4).toBe("4567");
    expect(d.currency).toBe("USD");
    expect(d.holdings).toEqual([{ symbol: "NVDA", name: "NVIDIA", assetType: "stock", sector: "Information Technology", value: 10, quantity: 1, price: 10, costBasis: null }]);
    expect(d.warnings).toEqual(["page 3 blurry"]);
  });

  it("explains blocked or truncated answers", () => {
    expect(() => parseGeminiResponse(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }))).toThrow(GeminiError);
    expect(() => parseGeminiResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"holdings": [' }] } }] }))).toThrow(/cut off/);
  });
});

describe("Gemini request", () => {
  it("needs a key", async () => {
    await expect(extractStatement(input, {})).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("sends the file inline with the key in a header, and asks for JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(wrap({ broker: "IBKR", statementDate: "2026-09-30", currency: "USD", holdings: [], warnings: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await extractStatement(input, { GEMINI_API_KEY: "k", GEMINI_MODEL: "m1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent");
    expect(url).not.toContain("k=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].inlineData).toEqual({ mimeType: "application/pdf", data: Buffer.from("%PDF").toString("base64") });
    expect(body.contents[0].parts[1].text).toMatch(/for P1/);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("explains rate limits and unsupported files in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(extractStatement(input, { GEMINI_API_KEY: "k" })).rejects.toThrow(/free limit/);
    await expect(extractStatement({ ...input, mimeType: "application/zip" }, { GEMINI_API_KEY: "k" })).rejects.toThrow(/PDF/);
  });
});
