import { Info } from "lucide-react";

/** Shown while the app runs on the bundled sample CSVs instead of the owner's Google Sheet. */
export function SampleDataBanner({ action }: { action?: string }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
      <Info aria-hidden size={16} className="mt-0.5 shrink-0" />
      <span>
        <strong className="font-semibold">These are sample numbers, not yours.</strong> Connect your Google Sheet to see your real data
        {action ? ` and ${action}` : ""} — Settings shows what to do next.
      </span>
    </p>
  );
}
