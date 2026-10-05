"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CircleCheck, CircleAlert } from "lucide-react";
import { validateEntry, type EntryErrors } from "@/lib/entry";
import { parseNumber } from "@/lib/data/clean";
import { formatDate } from "@/lib/format";
import { Money } from "@/components/currency";
import { addEntryAction, type AddState } from "./actions";

interface PortfolioOption {
  id: string;
  name: string;
  managed: boolean;
  lastInvested: number;
  lastValue: number | null;
  lastDate: string | null;
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const inputCls =
  "min-h-12 w-full rounded-xl border bg-surface px-3.5 text-base outline-none transition-colors duration-200 placeholder:text-subtle focus:border-accent aria-[invalid=true]:border-down";

export function AddEntryForm({ portfolios, today }: { portfolios: PortfolioOption[]; today: string }) {
  const [state, action, pending] = useActionState<AddState, FormData>(addEntryAction, { status: "idle" });
  const [id, setId] = useState(newId);
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const selected = portfolios.find((p) => p.id === portfolioId);
  const [date, setDate] = useState(today);
  const [flow, setFlow] = useState("");
  const [invested, setInvested] = useState(selected ? String(selected.lastInvested) : "");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [clientErrors, setClientErrors] = useState<EntryErrors>({});

  // After a successful save: fresh id (so a retry can't double-add) and a clean form.
  useEffect(() => {
    if (state.status === "saved") {
      setId(newId());
      setFlow("");
      setValue("");
      setNotes("");
    }
  }, [state]);

  const choosePortfolio = (pid: string) => {
    setPortfolioId(pid);
    const p = portfolios.find((x) => x.id === pid);
    setInvested(p ? String(p.lastInvested) : "");
    setFlow("");
  };

  // Deposit helper: enter this period's deposit (+) / withdrawal (−) and invested is computed.
  const onFlow = (v: string) => {
    setFlow(v);
    const n = parseNumber(v);
    if (selected && (n.ok || v.trim() === "")) setInvested(String(Math.round((selected.lastInvested + (n.ok ? n.value : 0)) * 100) / 100));
  };

  const investedChange = useMemo(() => {
    const n = parseNumber(invested);
    return selected && n.ok ? n.value - selected.lastInvested : null;
  }, [invested, selected]);

  const serverErrors = state.status === "error" ? state.errors ?? {} : {};
  const errors = { ...serverErrors, ...clientErrors };

  return (
    <form
      action={action}
      noValidate
      onSubmit={(e) => {
        const r = validateEntry({ id, date, portfolioId, invested, value, notes }, today, portfolios.map((p) => p.id));
        setClientErrors(r.ok ? {} : r.errors);
        if (!r.ok) e.preventDefault();
      }}
      className="space-y-5"
    >
      <input type="hidden" name="id" value={id} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Portfolio</legend>
        <div className="grid gap-2">
          {portfolios.map((p) => (
            <label
              key={p.id}
              className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 transition-colors duration-200 ${
                portfolioId === p.id ? "border-accent bg-accent-soft" : "border-line bg-surface"
              }`}
            >
              <span className="flex items-center gap-3">
                <input type="radio" name="portfolioId" value={p.id} checked={portfolioId === p.id} onChange={() => choosePortfolio(p.id)} className="size-4 accent-[var(--accent)]" />
                <span>
                  <span className="text-sm font-medium">
                    {p.id} · {p.name}
                  </span>
                  {p.managed ? <span className="block text-xs text-muted">Managed — kept separate</span> : null}
                </span>
              </span>
              {p.lastDate ? <span className="text-right text-xs text-muted">Last {formatDate(p.lastDate)}</span> : null}
            </label>
          ))}
        </div>
        <FieldError msg={errors.portfolioId} />
      </fieldset>

      <Field label="Date" error={errors.date} htmlFor="date" hint={date ? formatDate(date) : undefined}>
        <input id="date" name="date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} className={`${inputCls} border-line`} />
      </Field>

      <Field label="Deposit / withdrawal this period" hint="Optional. Use − for a withdrawal. Updates invested below." htmlFor="flow">
        <input id="flow" type="text" inputMode="decimal" autoComplete="off" placeholder="e.g. 1000 or −500" value={flow} onChange={(e) => onFlow(e.target.value)} className={`${inputCls} border-line`} />
      </Field>

      <Field
        label="Invested (USD, cumulative)"
        error={errors.invested}
        htmlFor="invested"
        hint={
          selected ? (
            <>
              Last: <Money usd={selected.lastInvested} decimals={2} />
              {investedChange ? (
                <>
                  {" "}
                  · change <Money usd={investedChange} signed decimals={2} /> {investedChange > 0 ? "(deposit)" : "(withdrawal)"}
                </>
              ) : null}
            </>
          ) : undefined
        }
      >
        <input id="invested" name="invested" type="text" inputMode="decimal" autoComplete="off" required value={invested} onChange={(e) => setInvested(e.target.value)} aria-invalid={!!errors.invested} className={`${inputCls} num border-line`} />
      </Field>

      <Field
        label="Current value (USD)"
        error={errors.value}
        htmlFor="value"
        hint={selected?.lastValue !== null && selected ? <>Last: <Money usd={selected.lastValue!} decimals={2} /></> : undefined}
      >
        <input id="value" name="value" type="text" inputMode="decimal" autoComplete="off" required placeholder="0.00" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!errors.value} className={`${inputCls} num border-line`} />
      </Field>

      <Field label="Notes" error={errors.notes} htmlFor="notes" hint="Optional. Write “Transfer” for money moved between portfolios.">
        <textarea id="notes" name="notes" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} aria-invalid={!!errors.notes} className={`${inputCls} border-line py-3`} />
      </Field>

      <div aria-live="polite">
        {state.status === "saved" ? (
          <p className="flex items-center gap-2 rounded-xl bg-up-soft px-3 py-2 text-sm text-up">
            <CircleCheck aria-hidden size={16} /> Saved {state.summary}.
          </p>
        ) : null}
        {state.status === "error" && state.message ? (
          <p className="flex items-start gap-2 rounded-xl bg-down-soft px-3 py-2 text-sm text-down">
            <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" /> {state.message}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full cursor-pointer rounded-xl bg-fg text-base font-semibold text-bg transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save entry"}
      </button>
    </form>
  );
}

function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: React.ReactNode; error?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <FieldError msg={error} /> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? (
    <p role="alert" className="text-xs text-down">
      {msg}
    </p>
  ) : null;
}
