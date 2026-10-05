import type { Metadata } from "next";
import { getDataSource, loadData } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { SampleDataBanner } from "@/components/sample-banner";
import { AddEntryForm } from "./form";

export const metadata: Metadata = { title: "Add entry" };
export const dynamic = "force-dynamic";

export default async function AddPage() {
  const load = await loadData();
  const readOnly = !getDataSource().writable;
  const portfolios = load.registry.list.filter((p) => p.status === "active").map((cfg) => {
    const last = load.data[cfg.id]?.snapshots.at(-1);
    return {
      id: cfg.id,
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
      {readOnly ? <SampleDataBanner action="save entries" /> : null}
      <AddEntryForm portfolios={portfolios} today={todayIso()} />
    </div>
  );
}
