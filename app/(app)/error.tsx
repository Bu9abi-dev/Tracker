"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Couldn&apos;t load your data</h1>
      <p className="text-sm text-muted">{error.message || "Something went wrong."}</p>
      <button type="button" onClick={reset} className="min-h-11 cursor-pointer rounded-xl bg-fg px-5 text-sm font-semibold text-bg">
        Try again
      </button>
    </div>
  );
}
