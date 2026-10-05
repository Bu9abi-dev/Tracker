"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // On the live site the server's message is replaced by a generic one (it has a digest);
  // Settings shows the real reason instead.
  const hidden = Boolean(error.digest);
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-lg font-semibold">Couldn&apos;t load your data</h1>
      <p className="text-sm text-muted">
        {hidden ? "Open Settings to see what went wrong with your Google Sheet." : error.message || "Something went wrong."}
      </p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={reset} className="min-h-11 cursor-pointer rounded-xl bg-fg px-5 text-sm font-semibold text-bg">
          Try again
        </button>
        {hidden ? (
          <Link href="/settings" className="flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold">
            Settings
          </Link>
        ) : null}
      </div>
    </div>
  );
}
