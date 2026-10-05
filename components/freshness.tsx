import { TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export function Freshness({ fetchedAt, source, staleReason }: { fetchedAt: string; source: string; staleReason?: string }) {
  return (
    <div className="space-y-2">
      {staleReason ? (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          <TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
          <span>
            {staleReason}. Showing the last good copy from {formatDateTime(fetchedAt)}.
          </span>
        </p>
      ) : null}
      <p className="text-center text-xs text-subtle">
        Updated {formatDateTime(fetchedAt)} · Source: {source === "csv" ? "CSV files" : "Google Sheet"} · 1 USD = 3.67 AED
      </p>
    </div>
  );
}
