import type { BenchmarkRun, BenchmarkRuns } from '../types';

export const PERFORMANCE_SOURCE_URL = 'https://benchmark-results.base.org/aggregate/metadata.json';
export const FEATURED_PAYLOAD = 'eth-transfer-existing';
export const FEATURED_BLOCK_TIME_MS = 2_000;

export type Cadence = 200 | 2_000;

export type PerformanceResult = {
  id: string;
  payload: string;
  blockTimeMilliseconds: Cadence;
  validatorGasPerSecond: number;
  createdAt: string;
};

export type PerformanceRelease = {
  clientVersion: string;
  publishedAt: string;
  results: PerformanceResult[];
};

export const payloadLabel = (payload: string): string => {
  const labels: Record<string, string> = {
    'eth-transfer-existing': 'ETH transfer — existing account',
    'eth-transfer-fresh': 'ETH transfer — new account',
    'b20-transfer-existing': 'B20 transfer — existing account',
    'b20-transfer-fresh': 'B20 transfer — new account',
    'calldata-random-16k': 'Calldata — random 16 KiB',
    'blake2f-rounds-50000': 'BLAKE2f — 50k rounds',
    'blake2f-rounds-200000': 'BLAKE2f — 200k rounds',
  };
  return labels[payload] ?? payload.replace(/-/g, ' ');
};

const timestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const toResult = (run: BenchmarkRun): PerformanceResult | null => {
  const blockTime = Number(run.testConfig.BlockTimeMilliseconds);
  const payload = run.testConfig.TransactionPayload;
  const gasPerSecond = run.result?.validatorMetrics?.gasPerSecond;
  if (
    !run.result?.success ||
    !run.result.complete ||
    (blockTime !== 200 && blockTime !== 2_000) ||
    typeof payload !== 'string' ||
    typeof gasPerSecond !== 'number' ||
    !Number.isFinite(gasPerSecond) ||
    !run.result.clientVersion
  ) {
    return null;
  }
  return {
    id: run.id,
    payload,
    blockTimeMilliseconds: blockTime,
    validatorGasPerSecond: gasPerSecond,
    createdAt: run.createdAt,
  };
};

/** Returns every published client-version cohort, newest first. */
export const performanceReleases = (metadata: BenchmarkRuns): PerformanceRelease[] => {
  // A versioned aggregate contains both version pages and `--latest` aliases.
  // Read the former to keep historical releases selectable without duplicate runs.
  const versionPageRuns = metadata.runs.filter((run) =>
    typeof run.testConfig.BenchmarkRun === 'string' && !run.testConfig.BenchmarkRun.endsWith('--latest'),
  );
  const hasLatestAlias = metadata.runs.some((run) =>
    typeof run.testConfig.BenchmarkRun === 'string' && run.testConfig.BenchmarkRun.endsWith('--latest'),
  );
  const sourceRuns = hasLatestAlias ? versionPageRuns : metadata.runs;
  const candidates = sourceRuns
    .map((run) => ({ run, result: toResult(run) }))
    .filter((candidate): candidate is { run: BenchmarkRun; result: PerformanceResult } => candidate.result !== null);
  const byVersion = new Map<string, { publishedAt: number; results: Map<string, PerformanceResult> }>();
  for (const { run, result } of candidates) {
    const clientVersion = run.result!.clientVersion!;
    const release = byVersion.get(clientVersion) ?? { publishedAt: Number.NEGATIVE_INFINITY, results: new Map() };
    release.publishedAt = Math.max(release.publishedAt, timestamp(result.createdAt));
    const key = `${result.payload}:${result.blockTimeMilliseconds}`;
    const previous = release.results.get(key);
    if (!previous || timestamp(result.createdAt) >= timestamp(previous.createdAt)) release.results.set(key, result);
    byVersion.set(clientVersion, release);
  }
  return [...byVersion.entries()]
    .map(([clientVersion, release]) => ({
      clientVersion,
      publishedAt: new Date(release.publishedAt).toISOString(),
      results: [...release.results.values()].sort((left, right) =>
        payloadLabel(left.payload).localeCompare(payloadLabel(right.payload)) || left.blockTimeMilliseconds - right.blockTimeMilliseconds,
      ),
    }))
    .sort((left, right) => timestamp(right.publishedAt) - timestamp(left.publishedAt) || right.clientVersion.localeCompare(left.clientVersion));
};

/** Selects the most recently published client-version cohort. */
export const latestPerformanceRelease = (metadata: BenchmarkRuns): PerformanceRelease | null =>
  performanceReleases(metadata)[0] ?? null;

/** Normalise elapsed time only when published test durations materially differ. */
export const shouldNormalizeProgress = (durationsSeconds: number[]): boolean => {
  const valid = durationsSeconds.filter((duration) => Number.isFinite(duration) && duration > 0);
  if (valid.length < 2) return false;
  const shortest = Math.min(...valid);
  const longest = Math.max(...valid);
  return (longest - shortest) / longest > 0.02;
};

export const featuredResult = (release: PerformanceRelease): PerformanceResult | undefined =>
  release.results.find(
    (result) => result.payload === FEATURED_PAYLOAD && result.blockTimeMilliseconds === FEATURED_BLOCK_TIME_MS,
  );
