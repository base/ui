"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useLoadTestList, useTestMetadata } from "../utils/useDataSeries";
import { uniqBy } from "../utils/collections";
import { formatLoadTestTimestamp } from "../utils/formatters";
import { loadTestHref } from "../routes";
import Select from "./Select";

/**
 * The run pickers that upstream (base/benchmark) rendered inside its own Navbar.
 * omni-ui supplies the app chrome — sidebar, header, section tabs — so only the
 * pickers came across, as a right-aligned toolbar row above the page content.
 */

const ToolbarRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-end gap-x-3">{children}</div>
);

interface BenchmarkRunSelectProps {
  /** The run currently being viewed, or "latest". */
  benchmarkRunId?: string;
  /** Where selecting a run should navigate — runHref or runComparisonHref. */
  hrefFor: (benchmarkRunId: string) => string;
}

/** Picks which benchmark run the run list / comparison charts are showing. */
export const BenchmarkRunSelect = ({
  benchmarkRunId,
  hrefFor,
}: BenchmarkRunSelectProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: allBenchmarkRuns, isLoading } = useTestMetadata();

  const navigateToBenchmarkRun = useCallback(
    (nextRunId: string) => {
      // Carry the filter state (?filters=…) across the run switch, as upstream did.
      const search = searchParams.toString();
      router.push(`${hrefFor(nextRunId)}${search ? `?${search}` : ""}`);
    },
    [hrefFor, router, searchParams],
  );

  const latestRun = useMemo(() => {
    return allBenchmarkRuns?.runs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
  }, [allBenchmarkRuns]);

  const benchmarkRunOptions = useMemo(() => {
    const options =
      allBenchmarkRuns?.runs.map((run) => {
        return {
          label: `${run.testName} - ${Intl.DateTimeFormat("en-US", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(run.createdAt))}`,
          value: `${run.testConfig.BenchmarkRun}`,
          benchmarkRunId: `${run.testConfig.BenchmarkRun}`,
        };
      }) ?? [];

    const uniqueOptions = uniqBy(options, "value");

    if (latestRun) {
      uniqueOptions.unshift({
        label: `Latest - ${latestRun.testName}`,
        value: "latest",
        benchmarkRunId: `${latestRun.testConfig.BenchmarkRun}`,
      });
    }

    const optionsWithTestNum = uniqueOptions.map((option) => {
      const allRunsMatching = allBenchmarkRuns?.runs.filter(
        (r) => `${r.testConfig.BenchmarkRun}` === option.benchmarkRunId,
      );

      const numSuccess = allRunsMatching?.filter(
        (r) => r.result?.complete && r.result.success,
      );

      return {
        ...option,
        label: `${option.label} - ${numSuccess?.length} / ${allRunsMatching?.length}`,
      };
    });

    return optionsWithTestNum;
  }, [allBenchmarkRuns, latestRun]);

  if (isLoading) {
    return (
      <ToolbarRow>
        <div className="animate-pulse bg-slate-200 rounded-md h-8 w-48" />
      </ToolbarRow>
    );
  }

  if (!allBenchmarkRuns?.runs.length) return null;

  return (
    <ToolbarRow>
      <Select
        aria-label="Benchmark run"
        value={benchmarkRunId}
        onChange={(e) => navigateToBenchmarkRun(e.target.value)}
      >
        {benchmarkRunOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </ToolbarRow>
  );
};

interface LoadTestRunSelectProps {
  network: string;
  timestamp: string;
}

/** Picks which load test run of a network the detail page is showing. */
export const LoadTestRunSelect = ({
  network,
  timestamp,
}: LoadTestRunSelectProps) => {
  const router = useRouter();
  const { data: loadTestEntries, isLoading } = useLoadTestList(network);

  const loadTestOptions = useMemo(() => {
    if (!loadTestEntries) return [];
    return loadTestEntries.map((entry) => ({
      label: formatLoadTestTimestamp(entry.timestamp),
      value: entry.timestamp,
    }));
  }, [loadTestEntries]);

  if (isLoading || loadTestOptions.length === 0) return null;

  return (
    <ToolbarRow>
      <Select
        aria-label="Load test run"
        value={timestamp}
        onChange={(e) => router.push(loadTestHref(network, e.target.value))}
      >
        {loadTestOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </ToolbarRow>
  );
};
