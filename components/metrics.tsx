import type { Metrics } from "@/lib/calculations";
import { formatDate } from "@/lib/format";
import { AltMoney, Money } from "@/components/currency";
import { Badge, Kpi, Pct } from "@/components/ui";

export const TWR_HINT =
  "Time-weighted return: chains weekly returns so deposits and withdrawals don't count as performance (Modified Dietz, flows assumed mid-week).";

/** Big number block: current value, TWR (headline %), P&L. */
export function Hero({ m, title, subtitle }: { m: Metrics; title: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted">{title}</div>
      <p className="text-[2.125rem] leading-tight font-semibold tracking-tight sm:text-5xl">
        <Money usd={m.value} />
      </p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-baseline gap-1.5" title={TWR_HINT}>
          <Pct value={m.twr} className="text-base font-semibold" />
          <span className="text-muted">TWR</span>
          {!m.twrReliable ? <Badge tone="warn">approx.</Badge> : null}
        </span>
        <span className="text-line-strong" aria-hidden>
          ·
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <Money usd={m.pnl} signed tone className="font-medium" />
          <span className="text-muted">
            P&amp;L (<Pct value={m.simpleReturn} tone={false} />)
          </span>
        </span>
      </div>
      {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
    </div>
  );
}

export function KpiGrid({ m }: { m: Metrics }) {
  const t = m.totals;
  const lc = m.lastChange;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Invested" sub="Net capital in">
        <Money usd={m.invested} />
      </Kpi>
      <Kpi label="P&L" sub={<AltMoney usd={m.pnl} signed />}>
        <Money usd={m.pnl} signed tone />
      </Kpi>
      <Kpi label="Simple return" sub="Value vs invested">
        <Pct value={m.simpleReturn} />
      </Kpi>
      <Kpi label="Time-weighted return" hint={TWR_HINT} sub={m.twrReliable ? "Deposits neutralised" : `${m.skippedPeriods} period(s) unmeasurable`}>
        <Pct value={m.twr} />
      </Kpi>
      <Kpi
        label="Since last snapshot"
        sub={
          lc ? (
            <>
              <Pct value={lc.return} /> · {formatDate(lc.startDate).slice(0, 6)} → {formatDate(lc.endDate).slice(0, 6)}
            </>
          ) : (
            "Needs two snapshots"
          )
        }
      >
        {lc ? <Money usd={lc.marketChange} signed tone /> : "—"}
      </Kpi>
      <Kpi
        label="Deposits"
        sub={
          <>
            Withdrawals <Money usd={t.withdrawals} />
            {t.transfersIn ? (
              <>
                {" "}
                · Transfers in <Money usd={t.transfersIn} />
              </>
            ) : null}
            {t.transfersOut ? (
              <>
                {" "}
                · out <Money usd={t.transfersOut} />
              </>
            ) : null}
          </>
        }
      >
        <Money usd={t.deposits} />
      </Kpi>
      <Kpi
        label="Max drawdown"
        sub={m.maxDrawdown && m.maxDrawdown.drawdown < 0 ? `${formatDate(m.maxDrawdown.peakDate)} → ${formatDate(m.maxDrawdown.troughDate)}` : "No drawdown yet"}
      >
        <Pct value={m.maxDrawdown?.drawdown ?? null} />
      </Kpi>
      <Kpi label="Current drawdown" sub={m.currentDrawdown === 0 ? "At peak" : "Below previous peak"}>
        <Pct value={m.currentDrawdown} />
      </Kpi>
      <Kpi
        label="Break-even"
        sub={
          m.breakEven ? (
            m.breakEven.pctNeeded !== null ? (
              <>
                Needs <Pct value={m.breakEven.pctNeeded} tone={false} /> from here
              </>
            ) : (
              "Value is zero"
            )
          ) : (
            "Value is above invested"
          )
        }
      >
        {m.breakEven ? <Money usd={m.breakEven.amount} className="text-down" /> : <span className="text-up">In profit</span>}
      </Kpi>
      <Kpi
        label="Best week"
        sub={
          m.best ? (
            <>
              <Money usd={m.best.marketChange} signed /> · {formatDate(m.best.endDate)}
            </>
          ) : (
            "—"
          )
        }
      >
        <Pct value={m.best?.return ?? null} />
      </Kpi>
      <Kpi
        label="Worst week"
        sub={
          m.worst ? (
            <>
              <Money usd={m.worst.marketChange} signed /> · {formatDate(m.worst.endDate)}
            </>
          ) : (
            "—"
          )
        }
      >
        <Pct value={m.worst?.return ?? null} />
      </Kpi>
      <Kpi label="Snapshots" sub={m.firstDate ? `Since ${formatDate(m.firstDate)}` : "No data"}>
        <span className="num">{m.chart.length}</span>
      </Kpi>
    </dl>
  );
}
