"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { findPortfolio } from "@/config/portfolios";
import { requireSession } from "@/lib/auth";
import { getDataSource, loadData } from "@/lib/data";
import { ReadOnlySourceError } from "@/lib/data/csv-source";
import { todayIso } from "@/lib/format";
import { GeminiError, MAX_FILE_BYTES, SUPPORTED_TYPES, extractStatement } from "@/lib/gemini";
import { accountHint, checkDraft, checkIdentity, draftToStatement, type Draft, type IdentityCheck } from "@/lib/holdings";

export interface Extracted {
  status: "review";
  statementId: string;
  portfolioId: string;
  portfolioName: string;
  managedFor: string | null;
  fileName: string;
  draft: Draft;
  identity: IdentityCheck;
  snapshot: { date: string; value: number } | null;
}

export type ExtractState = { status: "idle" } | { status: "error"; message: string } | Extracted;

function guessType(file: File): string {
  if (file.type && SUPPORTED_TYPES[file.type]) return file.type;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return { pdf: "application/pdf", csv: "text/csv", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", heic: "image/heic", heif: "image/heif", webp: "image/webp", txt: "text/plain" }[ext] ?? file.type;
}

/** Step 1: read the statement with Gemini. Nothing is saved. */
export async function extractAction(_prev: ExtractState, form: FormData): Promise<ExtractState> {
  await requireSession();
  const load = await loadData();
  const portfolio = findPortfolio(load.registry, String(form.get("portfolioId") ?? ""));
  if (!portfolio || portfolio.status !== "active") return { status: "error", message: "Choose which portfolio this statement is for." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a statement file first." };
  if (file.size > MAX_FILE_BYTES) {
    return { status: "error", message: "That file is over 4 MB. Try exporting fewer pages, or take screenshots of the holdings page instead." };
  }
  if (/\.xlsx?$/i.test(file.name)) return { status: "error", message: "Excel files can't be read yet — export the statement as PDF or CSV instead." };

  try {
    const draft = await extractStatement({
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: guessType(file),
      fileName: file.name,
      prompt: String(form.get("prompt") ?? ""),
      portfolioName: `${portfolio.id} · ${portfolio.name}`,
    });
    const hint = accountHint(draft.broker, draft.accountLast4);
    const last = load.data[portfolio.id]?.snapshots.at(-1);
    return {
      status: "review",
      statementId: randomUUID(),
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      managedFor: portfolio.ownership === "managed" ? (portfolio.managedFor ?? "someone else") : null,
      fileName: file.name.slice(0, 120),
      draft,
      identity: checkIdentity(hint, portfolio, load.registry.list),
      snapshot: last ? { date: last.date, value: last.value } : null,
    };
  } catch (err) {
    if (err instanceof GeminiError) return { status: "error", message: err.message };
    console.error("extract failed", (err as Error).message);
    return { status: "error", message: "Something went wrong reading the statement. Try again." };
  }
}

export type SaveState = { status: "idle" } | { status: "error"; message: string } | { status: "saved"; portfolioId: string; positions: number };

/** Step 2: save the reviewed holdings to the Sheet. */
export async function saveStatementAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  await requireSession();
  let payload: { statementId: string; portfolioId: string; fileName: string; draft: Draft; confirmIdentity?: boolean; confirmManaged?: boolean };
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { status: "error", message: "Something went wrong — please upload the statement again." };
  }
  const load = await loadData();
  const portfolio = findPortfolio(load.registry, payload.portfolioId);
  if (!portfolio || portfolio.status !== "active") return { status: "error", message: "That portfolio isn't available." };
  if (!/^[\w-]{8,64}$/.test(payload.statementId ?? "")) return { status: "error", message: "Please upload the statement again." };

  const check = checkDraft(payload.draft, todayIso());
  if (!check.ok) return { status: "error", message: check.blocking[0] ?? "Some rows still need checking." };
  const identity = checkIdentity(accountHint(payload.draft.broker, payload.draft.accountLast4), portfolio, load.registry.list);
  if ((identity.looksLike || identity.mismatch) && !payload.confirmIdentity) return { status: "error", message: "Confirm the statement belongs to this portfolio." };
  if (portfolio.ownership === "managed" && !payload.confirmManaged) return { status: "error", message: `Confirm this is ${portfolio.managedFor}'s statement.` };

  const statement = draftToStatement(payload.draft, {
    id: payload.statementId,
    portfolioId: portfolio.id,
    fileName: String(payload.fileName ?? "").slice(0, 120),
    savedAt: new Date().toISOString(),
  });
  try {
    await getDataSource().saveStatement(statement);
  } catch (err) {
    if (err instanceof ReadOnlySourceError) return { status: "error", message: err.message };
    return { status: "error", message: `Couldn't save: ${(err as Error).message}` };
  }
  revalidatePath("/", "layout");
  return { status: "saved", portfolioId: portfolio.id, positions: statement.holdings.length };
}
