import { ChevronRight, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { DataIssue } from "@/lib/data/types";
import { formatDate } from "@/lib/format";

const ICON = { error: CircleAlert, warning: TriangleAlert, info: Info } as const;
const TONE = { error: "text-down", warning: "text-warn", info: "text-muted" } as const;
const ORDER = { error: 0, warning: 1, info: 2 } as const;

/** Rows that were skipped or look suspicious. Nothing is dropped silently. */
export function DataIssuesPanel({ issues, names = {}, showPortfolio = true }: { issues: DataIssue[]; names?: Record<string, string>; showPortfolio?: boolean }) {
  if (issues.length === 0) return null;
  const sorted = [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (b.date ?? "").localeCompare(a.date ?? ""));
  const skipped = issues.filter((i) => i.action === "skipped").length;
  const needsLook = issues.filter((i) => i.severity !== "info").length;
  return (
    <details className="group rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
      <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 sm:px-5">
        <span className="flex items-center gap-2.5">
          <TriangleAlert aria-hidden size={18} className={needsLook ? "text-warn" : "text-muted"} />
          <span className="font-medium">Data issues</span>
          <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{issues.length}</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {skipped} skipped
          <ChevronRight aria-hidden size={16} className="transition-transform duration-200 group-open:rotate-90" />
        </span>
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {sorted.map((i, n) => {
          const Icon = ICON[i.severity];
          return (
            <li key={n} className="flex gap-3 px-4 py-3 text-sm sm:px-5">
              <Icon aria-label={i.severity} size={16} className={`mt-0.5 shrink-0 ${TONE[i.severity]}`} />
              <div className="min-w-0">
                <p className="text-fg">{i.message}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {showPortfolio ? `${i.portfolioId} ${names[i.portfolioId] ?? ""} · ` : ""}
                  {i.row ? `Row ${i.row} · ` : ""}
                  {i.date ? `${formatDate(i.date)} · ` : ""}
                  {i.action === "skipped" ? "Not used in calculations" : "Kept"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
