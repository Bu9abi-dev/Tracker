import type { Metadata } from "next";
import { PORTFOLIOS } from "@/config/portfolios";
import { loadData } from "@/lib/data";
import { buildJournal } from "@/lib/portfolio";
import { Journal } from "./journal";

export const metadata: Metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const entries = buildJournal(await loadData());
  const portfolios = PORTFOLIOS.filter((p) => entries.some((e) => e.portfolioId === p.id)).map((p) => ({
    id: p.id,
    name: p.shortName,
    color: p.color,
  }));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
      <Journal entries={entries} portfolios={portfolios} />
    </div>
  );
}
