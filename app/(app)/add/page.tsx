import type { Metadata } from "next";
import { getPortfolio } from "@/config/portfolios";
import { getDataSource, loadData } from "@/lib/data";
import { WRITABLE_IDS } from "@/lib/entry";
import { todayIso } from "@/lib/format";
import { AddEntryForm } from "./form";

export const metadata: Metadata = { title: "Add entry" };
export const dynamic = "force-dynamic";

export default async function AddPage() {
  const load = await loadData();
  const readOnly = getDataSource().kind === "csv";
  const portfolios = WRITABLE_IDS.map((id) => {
    const last = load.portfolios[id]?.snapshots.at(-1);
    const cfg = getPortfolio(id)!;
    return {
      id,
      name: cfg.name,
      managed: cfg.ownership === "managed",
      lastInvested: last?.invested ?? 0,
      lastValue: last?.value ?? null,
      lastDate: last?.date ?? null,
    };
  });
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add entry</h1>
        <p className="mt-1 text-sm text-muted">Record a snapshot. Amounts in USD.</p>
      </div>
      {readOnly ? (
        <p role="status" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          Phase 1: data comes from the CSV files, which are read-only. Set <code>DATA_SOURCE=apps-script</code> to save entries to your Google Sheet. You
          can still try the form; it validates but won&apos;t save.
        </p>
      ) : null}
      <AddEntryForm portfolios={portfolios} today={todayIso()} />
    </div>
  );
}
