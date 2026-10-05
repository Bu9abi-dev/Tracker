import { afterEach, describe, expect, it, vi } from "vitest";

const URL_ = "https://script.google.com/macros/s/abc/exec";
const TOKEN = "t".repeat(40);

async function freshSource() {
  vi.resetModules(); // module-level cache starts empty
  const { createAppsScriptSource } = await import("./apps-script-source");
  return createAppsScriptSource(URL_, TOKEN);
}

const reply = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("Apps Script source", () => {
  it("sends the token in the POST body, never the URL, and maps rows", async () => {
    const fetchMock = vi.fn(async () =>
      reply({ ok: true, generatedAt: "2026-10-05T10:00:00Z", portfolios: { P1: [{ date: "2026-10-02", invested: 1, value: 2, notes: "", row: 5 }], PX: [{}] } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const src = await freshSource();
    const out = await src.loadRaw();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ action: "list", token: TOKEN });
    expect(out.rows.P1).toEqual([{ date: "2026-10-02", invested: 1, value: 2, notes: "", row: 5 }]);
    expect(Object.keys(out.rows)).toEqual(["P1"]); // unknown ids ignored
  });

  it("serves the last good copy, labelled, when the Sheet is unavailable", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ ok: true, portfolios: { P1: [] } }))
      .mockResolvedValueOnce(reply("<html>Error</html>"));
    vi.stubGlobal("fetch", fetchMock);
    const src = await freshSource();
    await src.loadRaw();
    vi.advanceTimersByTime(61_000);
    const out = await src.loadRaw();
    expect(out.staleReason).toMatch(/Live data unavailable/);
    vi.useRealTimers();
  });

  it("throws on errors when there is no cached copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: false, error: "Unauthorized" })));
    const src = await freshSource();
    await expect(src.loadRaw()).rejects.toThrow("Unauthorized");
  });

  it("posts new entries", async () => {
    const fetchMock = vi.fn(async () => reply({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const src = await freshSource();
    const entry = { id: "abcdefgh-1", portfolioId: "P1" as const, date: "2026-10-02", invested: 1, value: 2, notes: "x" };
    await src.addEntry(entry);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ action: "add", entry, token: TOKEN });
  });
});
