import type { Metadata } from "next";
import { nextPortfolioId } from "@/config/portfolios";
import { loadData } from "@/lib/data";
import { SampleDataBanner } from "@/components/sample-banner";
import { NewPortfolioForm } from "./form";

export const metadata: Metadata = { title: "New portfolio" };
export const dynamic = "force-dynamic";

export default async function NewPortfolioPage() {
  const load = await loadData();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New portfolio</h1>
        <p className="mt-1 text-sm text-muted">It gets its own tab in your Google Sheet, laid out like your others.</p>
      </div>
      {load.source === "csv" ? <SampleDataBanner action="add portfolios" /> : null}
      <NewPortfolioForm nextId={nextPortfolioId(load.registry)} personalNow={load.registry.personalIds.join(" + ")} />
    </div>
  );
}
