"use client";

import { FileText } from "lucide-react";
import { holdingsSummary, type SectorSlice } from "@/lib/calculations";
import type { Statement } from "@/lib/data/types";
import { formatDate, formatPercent } from "@/lib/format";
import { AllocationDonut } from "@/components/charts/charts";
import { Money } from "@/components/currency";
import { Badge, Card, Pct, SectionTitle } from "@/components/ui";

const SECTOR_COLORS = ["--chart-1", "--chart-2", "--chart-3", "--chart-6", "--chart-7", "--chart-8", "--chart-4"];

export function sectorItems(slices: SectorSlice[]) {
  let i = 0;
  return slices.map((s) => ({
    id: s.sector,
    label: s.sector,
    value: s.value,
    share: s.share,
    color: s.sector === "Cash" ? "--chart-5" : SECTOR_COLORS[i++ % SECTOR_COLORS.length]!,
  }));
}

export function SectorDonut({ slices }: { slices: SectorSlice[] }) {
  return <AllocationDonut items={sectorItems(slices)} />;
}

/** Current holdings from the latest statement: amounts, profitability, sector allocation. */
export function HoldingsSection({
  statement,
  sectors,
  snapshot,
}: {
  statement: Statement;
  sectors: SectorSlice[];
  snapshot: { date: string; value: number } | null;
}) {
  const s = holdingsSummary(statement.holdings);
  const cash = statement.holdings.filter((h) => h.assetType === "cash").reduce((a, h) => a + h.valueUsd, 0);
  return (
    <section className="space-y-4" aria-labelledby="holdings">
      <SectionTitle
        sub={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <FileText aria-hidden size={14} /> {statement.fileName || "Statement"} · as of {formatDate(statement.statementDate)}
          </span>
        }
      >
        <span id="holdings">Holdings</span>
      </SectionTitle>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Holdings value">
          <Money usd={s.totalValue} />
        </Stat>
        <Stat label="Unrealized P&L" sub={s.pnl === null ? "Statement has no cost data" : `On ${s.positionsWithCost} of ${s.positions} positions with cost`}>
          {s.pnl === null ? "—" : <Money usd={s.pnl} signed tone />}
        </Stat>
        <Stat label="Return on cost" sub={s.costKnown ? <>Cost <Money usd={s.costKnown} /></> : "—"}>
          <Pct value={s.pnlPct} />
        </Stat>
        <Stat label="Cash" sub={`${s.positions} positions`}>
          <Money usd={cash} />
        </Stat>
      </dl>

      {snapshot && Math.abs(snapshot.value - s.totalValue) > Math.max(1, 0.01 * s.totalValue) ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          Your latest snapshot ({formatDate(snapshot.date)}) says <Money usd={snapshot.value} />. Performance numbers above use your snapshots; holdings use
          your latest statement ({formatDate(statement.statementDate)}), so the totals can differ.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle sub="Share of holdings value">Sectors</SectionTitle>
          <SectorDonut slices={sectors} />
        </Card>
        <Card className="lg:col-span-2 !p-0">
          <ul className="divide-y divide-line">
            {s.rows.map((r, i) => (
              <li key={`${r.holding.symbol}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="font-semibold">{r.holding.symbol || r.holding.name}</span>
                    {r.holding.assetType === "cash" ? <Badge>Cash</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {r.holding.symbol ? r.holding.name : ""}
                    {r.holding.quantity !== null ? ` · ${r.holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })} units` : ""}
                  </p>
                  <p className="truncate text-xs text-subtle">{r.holding.sector}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Money usd={r.holding.valueUsd} className="block text-sm font-semibold" />
                  <span className="num block text-xs text-muted">{formatPercent(r.weight, { signed: false, decimals: 1 })} of total</span>
                  {r.pnl !== null ? (
                    <span className="block text-xs">
                      <Money usd={r.pnl} signed tone /> <Pct value={r.pnlPct} className="text-muted" tone={false} />
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}

function Stat({ label, sub, children }: { label: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="truncate text-lg font-semibold tracking-tight">{children}</dd>
      {sub ? <dd className="truncate text-xs text-muted">{sub}</dd> : null}
    </div>
  );
}
