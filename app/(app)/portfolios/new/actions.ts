"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PALETTE, nextPortfolioId } from "@/config/portfolios";
import { requireSession } from "@/lib/auth";
import { getDataSource, loadData } from "@/lib/data";
import { ReadOnlySourceError } from "@/lib/data/csv-source";
import { validateNewPortfolio, type NewPortfolioErrors } from "@/lib/new-portfolio";

export type CreateState = { status: "idle" } | { status: "error"; message?: string; errors?: NewPortfolioErrors };

export async function createPortfolioAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  await requireSession();
  const { registry } = await loadData();
  const id = nextPortfolioId(registry);
  const result = validateNewPortfolio(Object.fromEntries(form), id, PALETTE[registry.list.length % PALETTE.length]!);
  if (!result.ok) return { status: "error", errors: result.errors, message: "Please fix the highlighted fields." };
  if (registry.list.some((p) => p.name.toLowerCase() === result.portfolio.name.toLowerCase())) {
    return { status: "error", errors: { name: "You already have a portfolio with this name." } };
  }
  try {
    await getDataSource().createPortfolio(result.portfolio, result.tab);
  } catch (err) {
    if (err instanceof ReadOnlySourceError) return { status: "error", message: err.message };
    return { status: "error", message: `Couldn't create it: ${(err as Error).message}` };
  }
  revalidatePath("/", "layout");
  redirect(`/p/${id}`);
}
