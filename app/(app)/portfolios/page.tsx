import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { loadData } from "@/lib/data";
import { buildAllViews } from "@/lib/portfolio";
import { formatDate } from "@/lib/format";
import { Money } from "@/components/currency";
import { Badge, Pct } from "@/components/ui";

export const metadata: Metadata = { title: "Portfolios" };
export const dynamic = "force-dynamic";

const GROUPS = [
  { title: "Personal", filter: (o: string, s: string) => o === "personal" && s === "active" },
  { title: "Managed for others", filter: (o: string, s: string) => o === "managed" },
  { title: "Planned & archived", filter: (o: string, s: string) => o === "personal" && s !== "active" },
];

export default async function PortfoliosPage() {
  const views = buildAllViews(await loadData());
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Portfolios</h1>
      {GROUPS.map((g) => {
        const list = views.filter((v) => g.filter(v.config.ownership, v.config.status));
        if (!list.length) return null;
        return (
          <section key={g.title} className="space-y-3">
            <h2 className="text-sm font-medium text-muted">{g.title}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {list.map(({ config, metrics: m }) => (
                <li key={config.id}>
                  <Link href={`/p/${config.id}`} className="flex min-h-18 items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 hover:bg-surface-2">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(${config.color})` }} aria-hidden />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted">{config.id}</span>
                          <span className="truncate font-medium">{config.name}</span>
                          {config.status !== "active" ? <Badge>{config.status}</Badge> : null}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {config.description}
                          {m.lastDate ? ` · ${formatDate(m.lastDate)}` : ""}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-right">
                      {m.chart.length ? (
                        <span>
                          <Money usd={m.value} className="block text-sm font-semibold" />
                          <span className="text-xs">
                            <Pct value={m.twr} /> <span className="text-muted">TWR</span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted">No data</span>
                      )}
                      <ChevronRight aria-hidden size={18} className="text-subtle" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-subtle">Add, rename or archive portfolios in config/portfolios.ts.</p>
    </div>
  );
}
