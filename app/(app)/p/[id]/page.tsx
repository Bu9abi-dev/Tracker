import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPortfolio } from "@/config/portfolios";
import { getDataSource, loadData } from "@/lib/data";
import { buildPortfolioView } from "@/lib/portfolio";
import { formatDate } from "@/lib/format";
import { DrawdownChart, PnlChart, ValueChart } from "@/components/charts/charts";
import { DataIssuesPanel } from "@/components/data-issues";
import { Freshness } from "@/components/freshness";
import { HistoryTable } from "@/components/history-table";
import { Hero, KpiGrid } from "@/components/metrics";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: getPortfolio(id)?.name ?? "Portfolio" };
}

export default async function PortfolioPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const config = getPortfolio(id.toUpperCase());
  if (!config) notFound();
  const load = await loadData();
  const view = buildPortfolioView(config, load.portfolios[config.id]);
  const m = view.metrics;
  const notes = Object.fromEntries(view.snapshots.filter((s) => s.notes).map((s) => [s.date, s.notes]));

  return (
    <div className="space-y-8">
      <Link href="/portfolios" className="-ml-2 inline-flex min-h-10 items-center gap-1 rounded-full px-2 text-sm text-muted hover:text-fg md:hidden">
        <ArrowLeft aria-hidden size={16} /> Portfolios
      </Link>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {config.ownership === "managed" ? <Badge tone="accent">Managed for {config.managedFor} · not in Personal</Badge> : null}
          {config.status !== "active" ? <Badge>{config.status === "planned" ? "Planned" : "Archived"}</Badge> : null}
          {config.ownership === "personal" && config.includeInPersonal ? <Badge>In Personal</Badge> : null}
        </div>
        <Hero
          m={m}
          title={
            <h1 className="text-fg">
              {config.id} · {config.name}
            </h1>
          }
          subtitle={
            <>
              {config.description}
              {m.lastDate ? ` · As of ${formatDate(m.lastDate)}` : ""}
            </>
          }
        />
        {config.note ? <p className="text-sm text-muted">{config.note}</p> : null}
      </section>

      {m.chart.length === 0 ? (
        <EmptyState title={config.status === "planned" ? "Not active yet" : "No snapshots yet"}>
          {config.status === "planned" ? "This portfolio is planned. Add a snapshot once it starts." : "Add a snapshot to see metrics and charts."}
        </EmptyState>
      ) : (
        <>
          <KpiGrid m={m} />
          <Card>
            <SectionTitle sub="Deposits, withdrawals and transfers are marked on the invested line.">Invested vs value</SectionTitle>
            <ValueChart rows={m.chart} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionTitle sub="Value − invested">P&amp;L over time</SectionTitle>
              <PnlChart rows={m.chart} />
            </Card>
            <Card>
              <SectionTitle sub="Time-weighted, market moves only">Drawdown from peak</SectionTitle>
              <DrawdownChart rows={m.chart} />
            </Card>
          </div>
          <section className="space-y-3">
            <SectionTitle sub={`${m.chart.length} snapshots, newest first`}>History</SectionTitle>
            <HistoryTable rows={m.chart} notes={notes} />
          </section>
        </>
      )}

      <DataIssuesPanel issues={view.issues} showPortfolio={false} />
      <Freshness fetchedAt={load.fetchedAt} source={getDataSource().kind} staleReason={load.staleReason} />
    </div>
  );
}
