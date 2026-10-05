"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { JournalEntry } from "@/lib/portfolio";
import { formatDate } from "@/lib/format";
import { Money } from "@/components/currency";
import { EmptyState } from "@/components/ui";

interface Props {
  entries: JournalEntry[];
  portfolios: { id: string; name: string; color: string }[];
}

export function Journal({ entries, portfolios }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());

  const shown = useMemo(
    () => entries.filter((e) => (filter === "all" || e.portfolioId === filter) && (!q || e.notes.toLowerCase().includes(q))),
    [entries, filter, q],
  );

  const byMonth = useMemo(() => {
    const groups: { key: string; label: string; items: JournalEntry[] }[] = [];
    for (const e of shown) {
      const key = e.date.slice(0, 7);
      let g = groups.at(-1);
      if (!g || g.key !== key) {
        g = { key, label: formatDate(`${key}-01`).slice(3), items: [] };
        groups.push(g);
      }
      g.items.push(e);
    }
    return groups;
  }, [shown]);

  const colorOf = Object.fromEntries(portfolios.map((p) => [p.id, p.color]));
  const nameOf = Object.fromEntries(portfolios.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Search notes</span>
          <Search aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            className="min-h-12 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-base outline-none placeholder:text-subtle focus:border-accent"
          />
        </label>
        <div role="radiogroup" aria-label="Filter by portfolio" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ id: "all", name: "All" }, ...portfolios].map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={filter === p.id}
              onClick={() => setFilter(p.id)}
              className={`min-h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                filter === p.id ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted hover:text-fg"
              }`}
            >
              {p.id === "all" ? "All" : `${p.id} ${p.name}`}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {shown.length} {shown.length === 1 ? "note" : "notes"}
        </p>
      </div>

      {byMonth.length === 0 ? (
        <EmptyState title="No notes found">{q ? "Try a different search." : "Notes you add with snapshots appear here."}</EmptyState>
      ) : (
        byMonth.map((g) => (
          <section key={g.key}>
            <h2 className="sticky top-14 z-10 -mx-4 bg-bg/90 px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase backdrop-blur">{g.label}</h2>
            <ol className="relative ml-1.5 border-l border-line">
              {g.items.map((e) => (
                <li key={`${e.portfolioId}-${e.date}`} className="relative pb-5 pl-5">
                  <span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-4 ring-bg" style={{ background: `var(${colorOf[e.portfolioId] ?? "--chart-5"})` }} aria-hidden />
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span className="num">{formatDate(e.date)}</span>
                    <span aria-hidden>·</span>
                    <span className="font-medium text-fg">
                      {e.portfolioId} {nameOf[e.portfolioId]}
                    </span>
                    {e.flow !== 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {e.flow > 0 ? "In" : "Out"} <Money usd={e.flow} signed />
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[15px] leading-relaxed">{e.notes}</p>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
