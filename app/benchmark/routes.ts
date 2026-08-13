// Route helpers for the benchmark section.
//
// Upstream (base/benchmark) is a standalone SPA mounted at `/`, so its links are
// bare paths like `/run-comparison/<id>`. Here the whole thing lives under
// `/benchmark`, so every link goes through one of these helpers rather than
// hard-coding the prefix at ~15 call sites.

export const BENCHMARK_BASE = '/benchmark';

/** The network used when a load-test route omits one. */
export const DEFAULT_LOAD_TEST_NETWORK = 'sepolia';

/** The run list for a benchmark run. `latest` resolves to the newest run. */
export const runHref = (benchmarkRunId: string): string => `${BENCHMARK_BASE}/run/${benchmarkRunId}`;

/** Per-block metric charts for a benchmark run. */
export const runComparisonHref = (benchmarkRunId: string): string =>
  `${BENCHMARK_BASE}/run-comparison/${benchmarkRunId}`;

/** Latest load test for a network (the landing route redirects to it). */
export const loadTestsHref = (network: string): string => `${BENCHMARK_BASE}/load-tests/${network}`;

/** Every load test run recorded for a network. */
export const loadTestAllHref = (network: string): string =>
  `${BENCHMARK_BASE}/load-tests/${network}/all`;

/** One load test run. */
export const loadTestHref = (network: string, timestamp: string): string =>
  `${BENCHMARK_BASE}/load-tests/${network}/${timestamp}`;
