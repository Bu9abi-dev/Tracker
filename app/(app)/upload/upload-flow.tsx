"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, FileUp, Trash2, TriangleAlert } from "lucide-react";
import { parseNumber } from "@/lib/data/clean";
import { SECTORS, type Sector } from "@/lib/data/types";
import { formatDate } from "@/lib/format";
import { checkDraft, type Draft, type DraftHolding } from "@/lib/holdings";
import { extractAction, saveStatementAction, type ExtractState, type Extracted, type SaveState } from "./actions";

interface PortfolioOption {
  id: string;
  name: string;
  managedFor: string | null;
}

const inputCls =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base outline-none transition-colors duration-200 placeholder:text-subtle focus:border-accent";

export function UploadFlow({ portfolios, initialPortfolio, today }: { portfolios: PortfolioOption[]; initialPortfolio?: string; today: string }) {
  const [extractState, extract, reading] = useActionState<ExtractState, FormData>(extractAction, { status: "idle" });
  // A review is shown until the person taps "Start over"; a new upload produces a new statement id.
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (extractState.status === "review" && extractState.statementId !== dismissed) {
    const id = extractState.statementId;
    return <Review key={id} data={extractState} today={today} onRestart={() => setDismissed(id)} />;
  }
  return <PickFile portfolios={portfolios} initialPortfolio={initialPortfolio} action={extract} reading={reading} state={extractState} />;
}

function PickFile({
  portfolios,
  initialPortfolio,
  action,
  reading,
  state,
}: {
  portfolios: PortfolioOption[];
  initialPortfolio?: string;
  action: (f: FormData) => void;
  reading: boolean;
  state: ExtractState;
}) {
  const [portfolioId, setPortfolioId] = useState(portfolios.find((p) => p.id === initialPortfolio)?.id ?? portfolios[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Which portfolio is this statement for?</legend>
        <div className="grid gap-2">
          {portfolios.map((p) => (
            <label
              key={p.id}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3.5 transition-colors duration-200 ${
                portfolioId === p.id ? "border-accent bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              <input type="radio" name="portfolioId" value={p.id} checked={portfolioId === p.id} onChange={() => setPortfolioId(p.id)} className="size-4 accent-[var(--accent)]" />
              <span>
                <span className="text-sm font-medium">
                  {p.id} · {p.name}
                </span>
                {p.managedFor ? <span className="block text-xs text-muted">Managed for {p.managedFor} — kept separate</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Statement file</span>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line-strong bg-surface px-4 text-center transition-colors duration-200 hover:border-accent">
          <FileUp aria-hidden size={22} className="text-muted" />
          <span className="text-sm font-medium">{fileName || "Choose a PDF, screenshot or CSV"}</span>
          <span className="text-xs text-muted">Up to 4 MB · from Files, Photos or your email</span>
          <input
            type="file"
            name="file"
            required
            accept="application/pdf,image/*,.csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
        </label>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="prompt" className="block text-sm font-medium">
          Anything Gemini should know? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="prompt"
          name="prompt"
          rows={3}
          maxLength={1000}
          placeholder="e.g. This is my IBKR statement for the active portfolio. Ignore the options section."
          className={`${inputCls} py-2.5`}
        />
      </div>

      <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
        Privacy: you&apos;re using Gemini&apos;s free plan, so Google may use uploaded files to improve its AI. The file itself isn&apos;t stored by this
        app — only the holdings you confirm are saved to your Google Sheet.
      </p>

      {state.status === "error" ? <ErrorNote>{state.message}</ErrorNote> : null}

      <button
        type="submit"
        disabled={reading}
        aria-busy={reading}
        className="min-h-12 w-full cursor-pointer rounded-xl bg-fg text-base font-semibold text-bg transition-opacity duration-200 hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {reading ? "Reading statement… this can take up to a minute" : "Read statement"}
      </button>
    </form>
  );
}

const toNum = (s: string): number | null => {
  const r = parseNumber(s);
  return r.ok ? r.value : null;
};
const fmt = (n: number | null) => (n === null || !Number.isFinite(n) ? "" : String(Math.round(n * 1e6) / 1e6));

function Review({ data, today, onRestart }: { data: Extracted; today: string; onRestart: () => void }) {
  const [draft, setDraft] = useState<Draft>(data.draft);
  // Stable keys so deleting a row doesn't shift the other rows' inputs.
  const [keys, setKeys] = useState(() => data.draft.holdings.map((_, i) => i));
  const [confirmIdentity, setConfirmIdentity] = useState(false);
  const [confirmManaged, setConfirmManaged] = useState(false);
  const [saveState, save, saving] = useActionState<SaveState, FormData>(saveStatementAction, { status: "idle" });
  const check = useMemo(() => checkDraft(draft, today), [draft, today]);
  const identityWarning = data.identity.looksLike ?? data.identity.mismatch;
  const ready = check.ok && (!identityWarning || confirmIdentity) && (!data.managedFor || confirmManaged);
  const cur = draft.currency.toUpperCase() === "AED" ? "AED" : "$";

  const setRow = (i: number, patch: Partial<DraftHolding>) =>
    setDraft((d) => ({ ...d, holdings: d.holdings.map((h, j) => (j === i ? { ...h, ...patch, checked: patch.checked ?? false } : h)) }));

  if (saveState.status === "saved") {
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-6 text-center">
        <CircleCheck aria-hidden size={32} className="mx-auto text-up" />
        <p className="font-semibold">Saved {saveState.positions} holdings to your Google Sheet.</p>
        <Link href={`/p/${saveState.portfolioId}`} className="inline-flex min-h-11 items-center rounded-xl bg-fg px-5 text-sm font-semibold text-bg">
          See {data.portfolioId} holdings
        </Link>
        <button type="button" onClick={onRestart} className="block w-full min-h-11 cursor-pointer text-sm font-medium text-accent">
          Upload another statement
        </button>
      </div>
    );
  }

  return (
    <form
      action={save}
      className="space-y-5"
      onSubmit={(e) => {
        if (!ready) e.preventDefault();
      }}
    >
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({ statementId: data.statementId, portfolioId: data.portfolioId, fileName: data.fileName, draft, confirmIdentity, confirmManaged })}
      />

      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">Check what Gemini found</p>
        <p className="mt-0.5 font-semibold">
          {data.portfolioId} · {data.portfolioName}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {data.fileName} · {draft.broker || "Unknown broker"}
          {draft.accountLast4 ? ` · account …${draft.accountLast4}` : ""}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted">Statement date</span>
            <input type="date" value={draft.statementDate} max={today} onChange={(e) => setDraft({ ...draft, statementDate: e.target.value })} className={inputCls} />
            <span className="block text-xs text-subtle">{formatDate(draft.statementDate) || "—"}</span>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted">Currency</span>
            <select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} className={inputCls}>
              <option value="USD">USD</option>
              <option value="AED">AED</option>
              {draft.currency !== "USD" && draft.currency !== "AED" ? <option value={draft.currency}>{draft.currency} (not supported)</option> : null}
            </select>
          </label>
        </div>
      </div>

      {draft.warnings.length ? (
        <div className="space-y-1 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <p className="font-medium">Gemini wasn&apos;t sure about:</p>
          <ul className="list-disc pl-5">
            {draft.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Totals */}
      <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
        <Row label="Holdings add up to">
          {cur} {check.holdingsTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </Row>
        <Row label="Statement total">
          <input
            inputMode="decimal"
            value={fmt(draft.reportedTotal)}
            placeholder="not shown"
            onChange={(e) => setDraft({ ...draft, reportedTotal: e.target.value.trim() ? toNum(e.target.value) : null, totalChecked: false })}
            className="num w-36 rounded-lg border border-line bg-surface px-2 py-1.5 text-right"
            aria-label="Statement total"
          />
        </Row>
        {data.snapshot ? (
          <Row label={`Your snapshot (${formatDate(data.snapshot.date)})`}>
            <span className="num text-muted">$ {data.snapshot.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
          </Row>
        ) : null}
        {check.totalProblem ? (
          <Tick checked={!!draft.totalChecked} onChange={(v) => setDraft({ ...draft, totalChecked: v })} problem={check.totalProblem}>
            I checked — the holdings and total are right
          </Tick>
        ) : null}
      </div>

      {/* Holdings as cards (readable on a phone) */}
      <ol className="space-y-3">
        {draft.holdings.map((h, i) => (
          <li key={keys[i] ?? i} className={`space-y-3 rounded-2xl border bg-surface p-4 ${check.rowProblems[i] && !h.checked ? "border-down" : "border-line"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-[6rem_1fr] gap-2">
                <input aria-label="Symbol" value={h.symbol} onChange={(e) => setRow(i, { symbol: e.target.value.toUpperCase() })} className={`${inputCls} font-semibold`} />
                <input aria-label="Name" value={h.name} onChange={(e) => setRow(i, { name: e.target.value })} className={inputCls} />
              </div>
              <button
                type="button"
                aria-label={`Remove ${h.symbol || "row"}`}
                onClick={() => {
                  setDraft((d) => ({ ...d, holdings: d.holdings.filter((_, j) => j !== i) }));
                  setKeys((k) => k.filter((_, j) => j !== i));
                }}
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-down-soft hover:text-down"
              >
                <Trash2 aria-hidden size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Quantity" value={h.quantity} onChange={(v) => setRow(i, { quantity: v })} />
              <NumField label={`Price (${cur})`} value={h.price} onChange={(v) => setRow(i, { price: v })} />
              <NumField label={`Value (${cur})`} value={h.value} onChange={(v) => setRow(i, { value: v ?? Number.NaN })} />
              <NumField label={`Cost (${cur})`} value={h.costBasis} onChange={(v) => setRow(i, { costBasis: v })} placeholder="not shown" />
            </div>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-muted">Sector</span>
              <select value={h.sector} onChange={(e) => setRow(i, { sector: e.target.value as Sector })} className={inputCls}>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {check.rowProblems[i] ? (
              <Tick checked={!!h.checked} onChange={(v) => setRow(i, { checked: v })} problem={check.rowProblems[i]!}>
                I checked this row against my statement
              </Tick>
            ) : null}
          </li>
        ))}
      </ol>

      {identityWarning ? (
        <Tick checked={confirmIdentity} onChange={setConfirmIdentity} problem={identityWarning} strong>
          I&apos;m sure this statement is for {data.portfolioId} · {data.portfolioName}
        </Tick>
      ) : null}
      {data.managedFor ? (
        <Tick checked={confirmManaged} onChange={setConfirmManaged} problem={`${data.portfolioId} is ${data.managedFor}'s money and stays separate from your Personal totals.`}>
          Yes, this is {data.managedFor}&apos;s statement
        </Tick>
      ) : null}

      {check.blocking.length ? (
        <ul className="space-y-1 rounded-xl bg-down-soft px-3 py-2.5 text-sm text-down">
          {check.blocking.map((b) => (
            <li key={b} className="flex gap-2">
              <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" /> {b}
            </li>
          ))}
        </ul>
      ) : null}
      {saveState.status === "error" ? <ErrorNote>{saveState.message}</ErrorNote> : null}

      <div className="pb-safe sticky bottom-20 z-10 space-y-2 rounded-2xl border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
        <button
          type="submit"
          disabled={!ready || saving}
          className="min-h-12 w-full cursor-pointer rounded-xl bg-fg text-base font-semibold text-bg transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : ready ? `Confirm & save ${draft.holdings.length} holdings` : "Check the highlighted items first"}
        </button>
        <button type="button" onClick={onRestart} className="min-h-10 w-full cursor-pointer text-sm font-medium text-muted hover:text-fg">
          Start over
        </button>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="num font-medium">{children}</span>
    </div>
  );
}

function NumField({ label, value, onChange, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  const [text, setText] = useState(fmt(value));
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-muted">{label}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.trim() ? toNum(e.target.value) : null);
        }}
        className={`${inputCls} num`}
      />
    </label>
  );
}

function Tick({ checked, onChange, problem, children, strong }: { checked: boolean; onChange: (v: boolean) => void; problem: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`space-y-2 rounded-xl px-3 py-2.5 text-sm ${strong ? "bg-down-soft text-down" : "bg-warn-soft text-warn"}`}>
      <p className="flex gap-2">
        <TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0" /> {problem}
      </p>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--accent)]" />
        {children}
      </label>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-down-soft px-3 py-2.5 text-sm text-down">
      <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </p>
  );
}

