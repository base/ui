"use client";

import { useMemo, useState } from "react";
import ChartSelector, {
  DataSelection,
  EmptyDataSelection,
} from "../components/ChartSelector";
import ChartGrid from "../components/ChartGrid";
import { useTestMetadata, useMultipleDataSeries } from "../utils/useDataSeries";
import { DataSeries } from "../types";
import { BenchmarkRunSelect } from "../components/BenchmarkToolbar";
import DataSourceError from "../components/DataSourceError";
import { runComparisonHref } from "../routes";

interface ProvidedProps {
  /** The benchmark run to chart, or "latest" to resolve to the newest one. */
  benchmarkRunId: string;
}

function RunComparison({ benchmarkRunId }: ProvidedProps) {
  const [selection, setSelection] = useState<DataSelection>(EmptyDataSelection);

  const {
    data: allBenchmarkRuns,
    isLoading: isLoadingBenchmarkRuns,
    error: metadataError,
  } = useTestMetadata();

  const latestBenchmarkRun = useMemo(() => {
    // slice() first: runs is SWR's cached array, and sort() is in-place.
    return allBenchmarkRuns?.runs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
  }, [allBenchmarkRuns]);

  const resolvedRunId =
    latestBenchmarkRun && benchmarkRunId === "latest"
      ? `${latestBenchmarkRun.testConfig.BenchmarkRun}`
      : benchmarkRunId;

  const benchmarkRuns = useMemo(() => {
    return {
      runs:
        allBenchmarkRuns?.runs.filter(
          (run) =>
            `${run.testConfig.BenchmarkRun}` === resolvedRunId &&
            run.result?.complete &&
            run.result.success,
        ) ?? [],
    };
  }, [allBenchmarkRuns, resolvedRunId]);

  const dataQueryKey = useMemo(() => {
    return selection.data.map((query) => {
      // Find the run that matches this outputDir to get the runId
      const run = benchmarkRuns.runs.find(
        (r) => r.outputDir === query.outputDir,
      );
      const runId = run?.id || query.outputDir; // Fallback to outputDir if no ID found
      return [runId, query.outputDir, query.role] as [string, string, string];
    });
  }, [selection.data, benchmarkRuns]);

  const { data: dataPerFile, isLoading } = useMultipleDataSeries(dataQueryKey);
  const data = useMemo(() => {
    if (!dataPerFile) {
      return dataPerFile;
    }

    return dataPerFile.map((data, index): DataSeries => {
      const { name, color } = selection.data[index];
      return {
        name,
        data,
        color,
        thresholds: selection.data[index].thresholds,
      };
    });
  }, [dataPerFile, selection.data]);

  if (metadataError) {
    return <DataSourceError error={metadataError} />;
  }

  if (isLoadingBenchmarkRuns) {
    return (
      <div className="flex flex-col w-full flex-grow gap-4">
        <div className="animate-pulse bg-slate-200 rounded h-6 w-48" />
        <div className="animate-pulse bg-slate-100 rounded h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full flex-grow gap-y-4">
      <BenchmarkRunSelect
        benchmarkRunId={benchmarkRunId}
        hrefFor={runComparisonHref}
      />
      <div className="flex flex-col w-full flex-grow">
        <ChartSelector
          onChangeDataQuery={setSelection}
          benchmarkRuns={benchmarkRuns}
          benchmarkRunId={resolvedRunId}
        />
        {isLoading ? (
          "Loading..."
        ) : (
          <ChartGrid role={selection.role} data={data ?? []} />
        )}
      </div>
    </div>
  );
}

export default RunComparison;
