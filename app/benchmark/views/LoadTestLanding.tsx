"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLoadTestList } from "../utils/useDataSeries";
import { loadTestHref } from "../routes";

interface ProvidedProps {
  network: string;
}

const LoadTestLanding = ({ network }: ProvidedProps) => {
  const router = useRouter();
  const { data: entries, isLoading, error } = useLoadTestList(network);

  // List endpoint returns runs sorted newest-first; take entry 0 as latest.
  const latest = !isLoading && !error ? entries?.[0] : undefined;

  useEffect(() => {
    if (!latest) return;
    router.replace(loadTestHref(latest.network, latest.timestamp));
  }, [latest, router]);

  return (
    <main className="max-w-5xl mx-auto w-full">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Load Tests</h1>
        <p className="text-sm text-slate-500 mt-1">
          Network: <span className="font-mono">{network}</span>
        </p>
      </header>

      {(isLoading || latest) && (
        <div className="text-sm text-slate-500">Loading load tests…</div>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 rounded-lg p-4 text-sm">
          Failed to load load tests: {String(error)}
        </div>
      )}

      {!isLoading && !error && (!entries || entries.length === 0) && (
        <div className="border border-slate-200 bg-white rounded-lg p-8 text-center text-sm text-slate-500">
          No load test runs found for{" "}
          <span className="font-mono">{network}</span>.
        </div>
      )}
    </main>
  );
};

export default LoadTestLanding;
