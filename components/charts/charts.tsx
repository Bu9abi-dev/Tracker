"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartRow } from "@/lib/calculations";
import { formatAmount, formatDate, formatMonthYear, formatPercent } from "@/lib/format";
import { useMoney } from "@/components/currency";

const AXIS = { fontSize: 11, fill: "var(--fg-subtle)" };

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-fg">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-muted">
          <span className="flex items-center gap-1.5">
            {r.color ? <span className="inline-block size-2 rounded-full" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="num font-medium text-fg">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function ChartFrame({ label, children, legend }: { label: string; children: React.ReactNode; legend?: React.ReactNode }) {
  return (
    <figure className="m-0">
      <div role="img" aria-label={label} className="h-56 w-full sm:h-72">
        {children}
      </div>
      {legend ? <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{legend}</figcaption> : null}
    </figure>
  );
}

function LegendItem({ children, swatch }: { children: React.ReactNode; swatch: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

const xAxisProps = {
  dataKey: "date",
  tick: AXIS,
  tickLine: false,
  axisLine: false,
  minTickGap: 36,
  tickFormatter: (d: string) => formatMonthYear(d),
  interval: "preserveStartEnd" as const,
};

/** Invested vs value, with deposits (dots) and withdrawals (squares) marked on the invested line. */
export function ValueChart({
  rows,
  label = "Invested vs value over time",
  minMarker = 0,
}: {
  rows: ChartRow[];
  label?: string;
  /** Only mark flows at least this large (USD). Keeps weekly DCA from cluttering combined charts. */
  minMarker?: number;
}) {
  const money = useMoney();
  const gid = useId().replace(/:/g, "");
  const data = rows.map((r) => ({ ...r, valueC: money.convert(r.value), investedC: money.convert(r.invested) }));
  // Weekly DCA would put a dot on every point. When deposits are that frequent, only mark
  // ones clearly above the usual amount (withdrawals and transfers are always marked).
  const deposits = rows.filter((x, i) => i > 0 && x.flowKind === "deposit").map((x) => x.flow).sort((a, z) => a - z);
  const frequent = deposits.length > 26;
  const usual = deposits[Math.floor(deposits.length / 2)] ?? 0;
  const depositMin = frequent ? Math.max(minMarker, usual * 1.5) : minMarker;
  const r = 3.5;
  const hasTransfers = rows.some((x) => x.flowKind.startsWith("transfer"));

  const marker = (props: { cx?: number; cy?: number; payload?: ChartRow; index?: number }) => {
    const { cx, cy, payload, index } = props;
    if (cx === undefined || cy === undefined || !payload || index === 0 || Math.abs(payload.flow) < Math.max(minMarker, 0.005))
      return <g key={`m${index}`} />;
    if (payload.flowKind === "deposit" && payload.flow >= depositMin)
      return <circle key={`m${index}`} cx={cx} cy={cy} r={r} fill="var(--surface)" stroke="var(--chart-1)" strokeWidth={2} />;
    if (payload.flowKind === "withdrawal")
      return <rect key={`m${index}`} x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="var(--surface)" stroke="var(--fg-muted)" strokeWidth={2} />;
    if (payload.flowKind.startsWith("transfer"))
      return <path key={`m${index}`} d={`M${cx} ${cy - 5}L${cx + 5} ${cy}L${cx} ${cy + 5}L${cx - 5} ${cy}Z`} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={1.5} />;
    return <g key={`m${index}`} />;
  };

  return (
    <ChartFrame
      label={label}
      legend={
        <>
          <LegendItem swatch={<span className="h-0.5 w-4 rounded bg-[var(--chart-1)]" />}>Value</LegendItem>
          <LegendItem swatch={<span className="w-4 border-t-2 border-dashed border-[var(--chart-invested)]" />}>Invested</LegendItem>
          <LegendItem swatch={<span className="size-2.5 rounded-full border-2 border-[var(--chart-1)]" />}>
            {frequent || minMarker > 0 ? `Deposit ≥ ${money.format(depositMin)}` : "Deposit"}
          </LegendItem>
          <LegendItem swatch={<span className="size-2.5 border-2 border-[var(--fg-muted)]" />}>Withdrawal</LegendItem>
          {hasTransfers ? <LegendItem swatch={<span className="size-2 rotate-45 bg-[var(--chart-1)]" />}>Transfer</LegendItem> : null}
        </>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`v${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis {...xAxisProps} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => formatAmount(v, money.currency, { compact: true })}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as ChartRow | undefined;
              if (!active || !p) return null;
              const rows = [
                { label: "Value", value: money.format(p.value), color: "var(--chart-1)" },
                { label: "Invested", value: money.format(p.invested), color: "var(--chart-invested)" },
                { label: "P&L", value: money.format(p.pnl, { signed: true }) },
              ];
              if (p.flow !== 0) rows.push({ label: flowLabel(p.flowKind), value: money.format(p.flow, { signed: true }) });
              return <TooltipBox title={formatDate(p.date)} rows={rows} />;
            }}
          />
          <Area type="monotone" dataKey="valueC" stroke="var(--chart-1)" strokeWidth={2} fill={`url(#v${gid})`} isAnimationActive={false} />
          <Line
            type="stepAfter"
            dataKey="investedC"
            stroke="var(--chart-invested)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={marker}
            activeDot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function flowLabel(kind: ChartRow["flowKind"]): string {
  return { deposit: "Deposit", withdrawal: "Withdrawal", "transfer-in": "Transfer in", "transfer-out": "Transfer out", none: "Flow" }[kind];
}

/** Cumulative P&L ($), green above zero and red below. */
export function PnlChart({ rows }: { rows: ChartRow[] }) {
  const money = useMoney();
  const gid = useId().replace(/:/g, "");
  const data = rows.map((r) => ({ ...r, pnlC: money.convert(r.pnl) }));
  const max = Math.max(0, ...data.map((d) => d.pnlC));
  const min = Math.min(0, ...data.map((d) => d.pnlC));
  const zero = max === min ? 0.5 : max / (max - min);

  return (
    <ChartFrame label="Profit and loss over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`s${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={zero} stopColor="var(--up)" />
              <stop offset={zero} stopColor="var(--down)" />
            </linearGradient>
            <linearGradient id={`f${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="var(--up)" stopOpacity={0.18} />
              <stop offset={zero} stopColor="var(--up)" stopOpacity={0.02} />
              <stop offset={zero} stopColor="var(--down)" stopOpacity={0.02} />
              <stop offset={1} stopColor="var(--down)" stopOpacity={0.18} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis {...xAxisProps} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => formatAmount(v, money.currency, { compact: true, signed: true })}
          />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as ChartRow | undefined;
              if (!active || !p) return null;
              return <TooltipBox title={formatDate(p.date)} rows={[{ label: "P&L", value: money.format(p.pnl, { signed: true }) }]} />;
            }}
          />
          <Area type="monotone" dataKey="pnlC" stroke={`url(#s${gid})`} strokeWidth={2} fill={`url(#f${gid})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Drawdown from peak on the time-weighted index (market-only). */
export function DrawdownChart({ rows }: { rows: ChartRow[] }) {
  const gid = useId().replace(/:/g, "");
  const data = rows.map((r) => ({ ...r, ddPct: r.drawdown * 100 }));
  return (
    <ChartFrame label="Drawdown from peak over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`d${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--down)" stopOpacity={0.04} />
              <stop offset="100%" stopColor="var(--down)" stopOpacity={0.22} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis {...xAxisProps} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={["dataMin", 0]} tickFormatter={(v: number) => `${Math.round(v)}%`} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as ChartRow | undefined;
              if (!active || !p) return null;
              return <TooltipBox title={formatDate(p.date)} rows={[{ label: "From peak", value: formatPercent(p.drawdown) }]} />;
            }}
          />
          <Area type="monotone" dataKey="ddPct" stroke="var(--down)" strokeWidth={1.5} fill={`url(#d${gid})`} baseValue={0} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export interface AllocationItem {
  id: string;
  label: string;
  value: number;
  share: number;
  color: string;
}

/** Allocation donut with a direct-labelled legend (not colour-only). */
export function AllocationDonut({ items }: { items: AllocationItem[] }) {
  const money = useMoney();
  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <div className="flex flex-col items-center gap-5">
      <div role="img" aria-label={`Allocation: ${items.map((i) => `${i.label} ${formatPercent(i.share, { signed: false, decimals: 0 })}`).join(", ")}`} className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {items.map((i) => (
                <Cell key={i.id} fill={`var(${i.color})`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-muted">Total</span>
          <span className="num text-sm font-semibold">{money.format(total, { compact: true })}</span>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(${i.color})` }} />
              <span className="truncate">{i.label}</span>
            </span>
            <span className="num shrink-0 text-muted">
              {formatPercent(i.share, { signed: false, decimals: 1 })} · <span className="text-fg">{money.format(i.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
