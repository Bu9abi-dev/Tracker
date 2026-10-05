import type { Metadata } from "next";
import { geminiConfigured } from "@/lib/gemini";
import { loadData } from "@/lib/data";
import { SampleDataBanner } from "@/components/sample-banner";
import { todayIso } from "@/lib/format";
import { UploadFlow } from "./upload-flow";

export const metadata: Metadata = { title: "Upload statement" };
export const dynamic = "force-dynamic";
// Reading a statement with Gemini can take up to a minute.
export const maxDuration = 60;

export default async function UploadPage({ searchParams }: PageProps<"/upload">) {
  const { portfolio } = await searchParams;
  const load = await loadData();
  const portfolios = load.registry.list
    .filter((p) => p.status === "active")
    .map((p) => ({ id: p.id, name: p.name, managedFor: p.ownership === "managed" ? (p.managedFor ?? "someone else") : null }));
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload statement</h1>
        <p className="mt-1 text-sm text-muted">Gemini reads your holdings from the statement. You check them before anything is saved.</p>
      </div>
      {load.source === "csv" ? <SampleDataBanner action="save statements" /> : null}
      {!geminiConfigured() ? (
        <p role="status" className="rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
          Statement reading isn&apos;t switched on yet. Add your free Gemini key in Vercel — Settings shows what to do next.
        </p>
      ) : null}
      <UploadFlow
        portfolios={portfolios}
        initialPortfolio={typeof portfolio === "string" ? portfolio.toUpperCase() : undefined}
        today={todayIso()}
      />
    </div>
  );
}
