"use client";

import { useState } from "react";
import type { ChartRow } from "@/lib/calculations";
import { formatDate, formatPercent } from "@/lib/format";
import { Money } from "@/components/currency";
import { Badge } from "@/components/ui";

const PAGE = 20;

/** Full snapshot history, newest first, with market change per period and notes. */
export function HistoryTable({ rows, notes }: { rows: ChartRow[]; notes: Record<string, string> }) {
  const [limit, setLimit] = useState(PAGE);
  const list = [...rows].reverse();
  const shown = list.slice(0, limit);

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">Snapshot history</caption>
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Date</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Invested</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Value</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Flow</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Market</th>
              <th scope="col" className="hidden px-4 py-2.5 text-left font-medium lg:table-cell">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => {
              const note = notes[r.date];
              const flowBadge =
                r.flow !== 0 ? (
                  <Badge tone={r.flowKind.startsWith("transfer") ? "accent" : "neutral"}>
                    {r.flowKind === "deposit" ? "Deposit" : r.flowKind === "withdrawal" ? "Withdrawal" : r.flowKind === "transfer-in" ? "Transfer in" : "Transfer out"}{" "}
                    <Money usd={r.flow} signed className="ml-1" />
                  </Badge>
                ) : null;
              return (
                <tr key={r.date} className="align-top">
                  <td className="px-4 py-3">
                    <span className="num whitespace-nowrap">{formatDate(r.date)}</span>
                    <div className="mt-1 space-y-1 md:hidden">{flowBadge}</div>
                    {note ? <p className="mt-1 max-w-[16rem] text-xs text-muted lg:hidden">{note}</p> : null}
                  </td>
                  <td className="hidden px-3 py-3 text-right sm:table-cell">
                    <Money usd={r.invested} decimals={2} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Money usd={r.value} decimals={2} />
                  </td>
                  <td className="hidden px-3 py-3 text-right md:table-cell">{flowBadge ?? <span className="text-subtle">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    {r.marketChange === null ? (
                      <span className="text-subtle">Base</span>
                    ) : (
                      <>
                        <Money usd={r.marketChange} signed tone />
                        <div className="num text-xs text-muted">{formatPercent(r.periodReturn)}</div>
                      </>
                    )}
                  </td>
                  <td className="hidden max-w-xs px-4 py-3 text-muted lg:table-cell">{note ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > limit ? (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE * 3)}
          className="mt-3 min-h-11 w-full cursor-pointer rounded-xl border border-line text-sm font-medium text-muted transition-colors duration-200 hover:text-fg"
        >
          Show more ({list.length - limit} older)
        </button>
      ) : null}
    </div>
  );
}
