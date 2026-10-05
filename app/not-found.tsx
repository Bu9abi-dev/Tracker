import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <Link href="/" className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium text-accent">
        Back to overview
      </Link>
    </main>
  );
}
