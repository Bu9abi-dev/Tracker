"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {/* Username field lets iOS Keychain / password managers save and autofill the password. */}
      <input type="text" name="username" autoComplete="username" defaultValue="portfolio" hidden readOnly />
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <Lock aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle" />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            aria-invalid={!!state.error}
            aria-describedby={state.error ? "login-error" : undefined}
            className="min-h-12 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-base outline-none transition-colors duration-200 focus:border-accent aria-[invalid=true]:border-down"
          />
        </div>
        {state.error ? (
          <p id="login-error" role="alert" className="text-sm text-down">
            {state.error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full cursor-pointer rounded-xl bg-fg text-base font-semibold text-bg transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
