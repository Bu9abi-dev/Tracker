"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getDataSource, loadData } from "@/lib/data";
import { ReadOnlySourceError } from "@/lib/data/csv-source";
import { validateEntry, type EntryErrors } from "@/lib/entry";
import { formatDate, todayIso } from "@/lib/format";

export type AddState = { status: "idle" } | { status: "error"; message?: string; errors?: EntryErrors } | { status: "saved"; id: string; summary: string };

export async function addEntryAction(_prev: AddState, form: FormData): Promise<AddState> {
  // Server actions are public POST endpoints: always re-check the session.
  await requireSession();
  const { registry } = await loadData();
  const writable = registry.list.filter((p) => p.status === "active").map((p) => p.id);
  const result = validateEntry(Object.fromEntries(form), todayIso(), writable);
  if (!result.ok) return { status: "error", errors: result.errors, message: "Please fix the highlighted fields." };
  try {
    await getDataSource().addEntry(result.entry);
  } catch (err) {
    if (err instanceof ReadOnlySourceError) return { status: "error", message: err.message };
    console.error("addEntry failed", (err as Error).message);
    return { status: "error", message: `Couldn't save: ${(err as Error).message}` };
  }
  revalidatePath("/", "layout");
  const e = result.entry;
  return { status: "saved", id: e.id, summary: `${e.portfolioId} · ${formatDate(e.date)}` };
}
