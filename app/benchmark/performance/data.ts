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

/**
 * Selects exactly one release: the client version whose successful published
 * result is newest. Within it, duplicate payload/cadence runs resolve to the
 * newest result. Older releases are never used to fill missing cells.
 */
export const latestPerformanceRelease = (
  metadata: BenchmarkRuns,
): PerformanceRelease | null => {
  // Versioned aggregate metadata publishes a stable `<cohort>--latest` page.
  // Prefer it when present; retain the legacy metadata fallback while old
  // aggregates are still served.
  const latestPageRuns = metadata.runs.filter((run) =>
    typeof run.testConfig.BenchmarkRun === 'string' && run.testConfig.BenchmarkRun.endsWith('--latest'),
  );
  const sourceRuns = latestPageRuns.length > 0 ? latestPageRuns : metadata.runs;
  const candidates = sourceRuns
    .map((run) => ({ run, result: toResult(run) }))
    .filter((candidate): candidate is { run: BenchmarkRun; result: PerformanceResult } => candidate.result !== null);
  if (candidates.length === 0) return null;

  const newestByVersion = new Map<string, number>();
  for (const { run } of candidates) {
    const version = run.result!.clientVersion!;
    newestByVersion.set(version, Math.max(newestByVersion.get(version) ?? Number.NEGATIVE_INFINITY, timestamp(run.createdAt)));
  }
  const [clientVersion, newestTimestamp] = [...newestByVersion.entries()]
    .sort(([leftVersion, leftTime], [rightVersion, rightTime]) => rightTime - leftTime || rightVersion.localeCompare(leftVersion))[0];

  const newestByWorkload = new Map<string, PerformanceResult>();
  for (const { run, result } of candidates) {
    if (run.result!.clientVersion !== clientVersion) continue;
    const key = `${result.payload}:${result.blockTimeMilliseconds}`;
    const previous = newestByWorkload.get(key);
    if (!previous || timestamp(result.createdAt) >= timestamp(previous.createdAt)) {
      newestByWorkload.set(key, result);
    }
  }

  return {
    clientVersion,
    publishedAt: new Date(newestTimestamp).toISOString(),
    results: [...newestByWorkload.values()].sort((left, right) =>
      payloadLabel(left.payload).localeCompare(payloadLabel(right.payload)) || left.blockTimeMilliseconds - right.blockTimeMilliseconds,
    ),
  };
};

export const featuredResult = (release: PerformanceRelease): PerformanceResult | undefined =>
  release.results.find(
    (result) => result.payload === FEATURED_PAYLOAD && result.blockTimeMilliseconds === FEATURED_BLOCK_TIME_MS,
  );
