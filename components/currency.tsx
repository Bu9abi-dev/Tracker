"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { convert, type Currency } from "@/lib/calculations";
import { direction, formatMoney, type MoneyOptions } from "@/lib/format";
import { CURRENCY_COOKIE, setPreferenceCookie } from "@/lib/preferences";

const CurrencyContext = createContext<{ currency: Currency; setCurrency: (c: Currency) => void }>({
  currency: "USD",
  setCurrency: () => {},
});

export function CurrencyProvider({ initial, children }: { initial: Currency; children: React.ReactNode }) {
  const [currency, setState] = useState<Currency>(initial);
  const setCurrency = useCallback((c: Currency) => {
    setState(c);
    setPreferenceCookie(CURRENCY_COOKIE, c);
  }, []);
  return <CurrencyContext.Provider value={{ currency, setCurrency }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

/** Converts a USD amount for display. All conversion happens here and in chart axes. */
export function useMoney() {
  const { currency } = useCurrency();
  return {
    currency,
    convert: (usd: number) => convert(usd, currency),
    format: (usd: number, opts?: MoneyOptions) => formatMoney(usd, currency, opts),
  };
}

const toneClass = { up: "text-up", down: "text-down", flat: "" } as const;

export function Money({
  usd,
  tone = false,
  className = "",
  ...opts
}: { usd: number; tone?: boolean; className?: string } & MoneyOptions) {
  const { format } = useMoney();
  return <span className={`num ${tone ? toneClass[direction(usd)] : ""} ${className}`}>{format(usd, opts)}</span>;
}

/** Shows the amount in the other currency too (used for P&L, which is asked for in $ and AED). */
export function AltMoney({ usd, className = "", ...opts }: { usd: number; className?: string } & MoneyOptions) {
  const { currency } = useCurrency();
  const other: Currency = currency === "USD" ? "AED" : "USD";
  return <span className={`num ${className}`}>{formatMoney(usd, other, opts)}</span>;
}

export function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency();
  return (
    <div role="radiogroup" aria-label="Display currency" className="inline-flex rounded-full border border-line bg-surface-2 p-0.5 text-xs font-medium">
      {(["USD", "AED"] as const).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={currency === c}
          onClick={() => setCurrency(c)}
          className={`min-h-9 min-w-12 cursor-pointer rounded-full px-3 transition-colors duration-200 ${
            currency === c ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-muted hover:text-fg"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
