import { direction, formatPercent } from "@/lib/format";

/** Percent with P&L direction colour. */
export function Pct({ value, tone = true, className = "", decimals = 2 }: { value: number | null | undefined; tone?: boolean; className?: string; decimals?: number }) {
  const d = direction(value);
  const color = tone ? (d === "up" ? "text-up" : d === "down" ? "text-down" : "") : "";
  return <span className={`num ${color} ${className}`}>{formatPercent(value, { decimals })}</span>;
}

export function Card({ children, className = "", as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <Tag className={`rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)] sm:p-5 ${className}`}>{children}</Tag>;
}

export function Kpi({ label, children, sub, hint }: { label: string; children: React.ReactNode; sub?: React.ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
      <dt className="flex items-center gap-1 text-xs font-medium text-muted" title={hint}>
        {label}
      </dt>
      <dd className="truncate text-lg font-semibold tracking-tight sm:text-xl">{children}</dd>
      {sub ? <dd className="truncate text-xs text-muted">{sub}</dd> : null}
    </div>
  );
}

export function SectionTitle({ children, sub, action }: { children: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{children}</h2>
        {sub ? <p className="mt-0.5 text-sm text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "accent" }) {
  const cls = {
    neutral: "bg-surface-2 text-muted ring-line",
    warn: "bg-warn-soft text-warn ring-warn/30",
    accent: "bg-accent-soft text-accent ring-accent/30",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}
