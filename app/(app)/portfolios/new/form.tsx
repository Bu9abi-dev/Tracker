"use client";

import { useActionState, useState } from "react";
import { CircleAlert } from "lucide-react";
import { createPortfolioAction, type CreateState } from "./actions";

const inputCls =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base outline-none transition-colors duration-200 placeholder:text-subtle focus:border-accent aria-[invalid=true]:border-down";

export function NewPortfolioForm({ nextId, personalNow }: { nextId: string; personalNow: string }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createPortfolioAction, { status: "idle" });
  const [ownership, setOwnership] = useState<"personal" | "managed" | "">("");
  const [status, setStatus] = useState<"active" | "planned">("active");
  const errors = state.status === "error" ? (state.errors ?? {}) : {};

  return (
    <form action={action} className="space-y-5">
      <p className="text-sm text-muted">
        It will be <strong className="text-fg">{nextId}</strong>.
      </p>
      <Field label="Name" htmlFor="name" error={errors.name}>
        <input id="name" name="name" required maxLength={60} placeholder="e.g. Gold savings" aria-invalid={!!errors.name} className={inputCls} />
      </Field>
      <Field label="Short name" htmlFor="shortName" error={errors.shortName} hint="Optional. Used on small labels.">
        <input id="shortName" name="shortName" maxLength={24} placeholder="e.g. Gold" aria-invalid={!!errors.shortName} className={inputCls} />
      </Field>
      <Field label="Description" htmlFor="description" error={errors.description} hint="Optional, e.g. the broker or account.">
        <input id="description" name="description" maxLength={120} placeholder="e.g. Physical gold, bought monthly" className={inputCls} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Whose money is it?</legend>
        {[
          { v: "personal", t: "Mine", d: "Your own investments." },
          { v: "managed", t: "Someone else's — I manage it", d: "Kept separate and never added to your Personal totals. This can't be changed later." },
        ].map((o) => (
          <label
            key={o.v}
            className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-200 ${
              ownership === o.v ? "border-accent bg-accent-soft" : "border-line bg-surface"
            }`}
          >
            <input type="radio" name="ownership" value={o.v} checked={ownership === o.v} onChange={() => setOwnership(o.v as "personal" | "managed")} className="mt-1 size-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-medium">{o.t}</span>
              <span className="block text-xs text-muted">{o.d}</span>
            </span>
          </label>
        ))}
        {errors.ownership ? <FieldError msg={errors.ownership} /> : null}
      </fieldset>

      {ownership === "managed" ? (
        <Field label="Whose money is it?" htmlFor="managedFor" error={errors.managedFor}>
          <input id="managedFor" name="managedFor" maxLength={40} placeholder="e.g. Dad" aria-invalid={!!errors.managedFor} className={inputCls} />
        </Field>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Status</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["active", "planned"] as const).map((v) => (
            <label key={v} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-medium ${status === v ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}>
              <input type="radio" name="status" value={v} checked={status === v} onChange={() => setStatus(v)} className="sr-only" />
              {v === "active" ? "Active now" : "Planned"}
            </label>
          ))}
        </div>
      </fieldset>

      {ownership === "personal" && status === "active" ? (
        <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
          <input type="checkbox" name="includeInPersonal" className="mt-1 size-5 accent-[var(--accent)]" />
          <span>
            <span className="block text-sm font-medium">Add it to my Personal totals</span>
            <span className="block text-xs text-muted">Personal is {personalNow} today. Leave this off to keep it on its own.</span>
          </span>
        </label>
      ) : null}

      {state.status === "error" && state.message ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-down-soft px-3 py-2.5 text-sm text-down">
          <CircleAlert aria-hidden size={16} className="mt-0.5 shrink-0" /> {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !ownership}
        className="min-h-12 w-full cursor-pointer rounded-xl bg-fg text-base font-semibold text-bg transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Creating…" : "Create portfolio"}
      </button>
    </form>
  );
}

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
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

function FieldError({ msg }: { msg: string }) {
  return (
    <p role="alert" className="text-xs text-down">
      {msg}
    </p>
  );
}
