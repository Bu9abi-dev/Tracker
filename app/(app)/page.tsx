import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getPortfolio, isPersonalId } from "@/config/portfolios";
import { loadData, getDataSource } from "@/lib/data";
import { buildAllViews, buildPersonalView } from "@/lib/portfolio";
import { formatDate } from "@/lib/format";
import { AllocationDonut, ValueChart } from "@/components/charts/charts";
import { DataIssuesPanel } from "@/components/data-issues";
import { Freshness } from "@/components/freshness";
import { Hero, KpiGrid } from "@/components/metrics";
import { Money } from "@/components/currency";
import { Badge, Card, EmptyState, Pct, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const load = await loadData();
  const personal = buildPersonalView(load.portfolios);
  const views = buildAllViews(load);
  const managed = views.filter((v) => v.config.ownership === "managed" && v.config.status === "active");
  const personalViews = views.filter((v) => isPersonalId(v.config.id));
  const other = views.filter((v) => v.config.status !== "active");
  const pm = personal.metrics;
  const names = personal.ids.map((id) => `${id} ${getPortfolio(id)?.shortName}`).join(" + ");
  const allIssues = views.flatMap((v) => v.issues);

  return (
    <div className="space-y-10">
      {/* Personal (P1 + P3) */}
      <section aria-labelledby="personal" className="space-y-5">
        <Hero
          m={pm}
          title={
            <>
              <span id="personal" className="text-fg">
                Personal
              </span>
              <span>· {names}</span>
            </>
          }
          subtitle={pm.lastDate ? `As of ${formatDate(pm.lastDate)} · TWR since ${formatDate(pm.firstDate)}` : undefined}
        />
        {pm.staleComponents.length ? (
          <p role="status" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
            {pm.staleComponents.map((id) => `${id} last updated ${formatDate(pm.latestByComponent[id] ?? null)}`).join(", ")} — combined returns stop at
            the last date where every portfolio is up to date.
          </p>
        ) : null}
        {pm.chart.length ? (
          <>
            <KpiGrid m={pm} />
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <SectionTitle sub="Combined P1 + P3. Larger deposits marked on the invested line.">Personal value over time</SectionTitle>
                <ValueChart rows={pm.chart} minMarker={500} label="Personal invested vs value over time" />
              </Card>
              <Card>
                <SectionTitle sub="Personal only — P2 excluded">Allocation</SectionTitle>
                <AllocationDonut
                  items={personal.allocation.map((a) => ({
                    ...a,
                    label: `${a.id} ${getPortfolio(a.id)?.shortName ?? ""}`,
                    color: getPortfolio(a.id)?.color ?? "--chart-5",
                  }))}
                />
              </Card>
            </div>
          </>
        ) : (
          <EmptyState title="No personal data yet">Add a snapshot for P1 or P3 to get started.</EmptyState>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {personalViews.map((v) => (
            <PortfolioRow key={v.config.id} id={v.config.id} name={v.config.name} sub={v.config.description} value={v.metrics.value} twr={v.metrics.twr} pnl={v.metrics.pnl} />
          ))}
        </ul>
      </section>

      {/* Managed money — always separate */}
      {managed.map((v) => (
        <section key={v.config.id} aria-labelledby={`managed-${v.config.id}`} className="space-y-5 rounded-3xl border border-line bg-surface-2/60 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="accent">Managed for {v.config.ownership === "managed" ? v.config.managedFor : ""} · not in Personal totals</Badge>
            <Link href={`/p/${v.config.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-accent">
              Details <ChevronRight aria-hidden size={16} />
            </Link>
          </div>
          <Hero
            m={v.metrics}
            title={
              <span id={`managed-${v.config.id}`} className="text-fg">
                {v.config.id} · {v.config.name}
              </span>
            }
            subtitle={v.metrics.lastDate ? `As of ${formatDate(v.metrics.lastDate)}` : undefined}
          />
          {v.metrics.chart.length ? <KpiGrid m={v.metrics} /> : <EmptyState title="No data yet" />}
        </section>
      ))}

      {other.length ? (
        <section aria-labelledby="other" className="space-y-3">
          <SectionTitle>
            <span id="other">Planned &amp; archived</span>
          </SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {other.map((v) => (
              <PortfolioRow
                key={v.config.id}
                id={v.config.id}
                name={v.config.name}
                sub={v.config.description}
                value={v.metrics.chart.length ? v.metrics.value : null}
                twr={v.metrics.twr}
                pnl={v.metrics.pnl}
                badge={v.config.status}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <DataIssuesPanel issues={allIssues} />
      <Freshness fetchedAt={load.fetchedAt} source={getDataSource().kind} staleReason={load.staleReason} />
    </div>
  );
}

function PortfolioRow({
  id,
  name,
  sub,
  value,
  twr,
  pnl,
  badge,
}: {
  id: string;
  name: string;
  sub: string;
  value: number | null;
  twr: number | null;
  pnl: number;
  badge?: string;
}) {
  return (
    <li>
      <Link
        href={`/p/${id}`}
        className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow)] transition-colors duration-200 hover:border-line-strong"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">{id}</span>
            <span className="truncate font-medium">{name}</span>
            {badge ? <Badge>{badge}</Badge> : null}
          </span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-right">
          {value !== null ? (
            <span>
              <Money usd={value} className="block text-sm font-semibold" />
              <span className="text-xs">
                <Pct value={twr} /> <span className="text-muted">TWR</span>
              </span>
              <span className="sr-only">
                P&amp;L <Money usd={pnl} signed />
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted">No data</span>
          )}
          <ChevronRight aria-hidden size={18} className="text-subtle" />
        </span>
      </Link>
    </li>
  );
}
