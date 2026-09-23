import { FEATURED_BLOCK_TIME_MS, FEATURED_PAYLOAD, featuredResult, latestPerformanceRelease } from './data';
import type { BenchmarkRun, BenchmarkRuns } from '../types';

const baseResult = (clientVersion = 'release-a', gasPerSecond = 100) => ({
  success: true,
  complete: true,
  clientVersion,
  validatorMetrics: { gasPerSecond },
  sequencerMetrics: { gasPerSecond, forkChoiceUpdated: 0, getPayload: 0 },
});

const run = (overrides: Partial<BenchmarkRun> = {}): BenchmarkRun => ({
  id: 'run', sourceFile: 'snapshot', outputDir: 'run', testName: 'Snapshot', testDescription: '', createdAt: '2026-09-23T20:00:00.000Z',
  testConfig: { ClientVersion: 'release-a', TransactionPayload: 'eth-transfer-existing', BlockTimeMilliseconds: 2000 },
  result: baseResult(),
  ...overrides,
});

describe('latestPerformanceRelease', () => {
  it('selects only the newest release and the newest duplicate workload result', () => {
    const metadata: BenchmarkRuns = { runs: [
      run({ id: 'older-release', createdAt: '2026-09-21T20:00:00.000Z' }),
      run({ id: 'old-repeat', createdAt: '2026-09-23T19:00:00.000Z' }),
      run({ id: 'new-repeat', createdAt: '2026-09-23T20:00:00.000Z', result: baseResult('release-a', 200) }),
      run({ id: 'new-cadence', createdAt: '2026-09-23T20:01:00.000Z', testConfig: { ClientVersion: 'release-b', TransactionPayload: 'eth-transfer-existing', BlockTimeMilliseconds: 200 }, result: baseResult('release-b', 300) }),
    ] };
    const release = latestPerformanceRelease(metadata)!;
    expect(release.clientVersion).toBe('release-b');
    expect(release.results).toEqual([expect.objectContaining({ id: 'new-cadence', validatorGasPerSecond: 300 })]);
  });

  it('does not use an older release to fill a missing latest-release workload', () => {
    const release = latestPerformanceRelease({ runs: [
      run({ id: 'older-2s', createdAt: '2026-09-22T00:00:00.000Z' }),
      run({ id: 'latest-200ms', createdAt: '2026-09-23T00:00:00.000Z', testConfig: { ClientVersion: 'release-b', TransactionPayload: FEATURED_PAYLOAD, BlockTimeMilliseconds: 200 }, result: baseResult('release-b') }),
    ] })!;
    expect(featuredResult(release)).toBeUndefined();
    expect(release.results).toHaveLength(1);
  });

  it('ignores incomplete results and finds the requested featured workload', () => {
    const release = latestPerformanceRelease({ runs: [
      run({ id: 'incomplete', createdAt: '2026-09-24T00:00:00.000Z', result: { ...baseResult(), complete: false } }),
      run(),
    ] })!;
    expect(featuredResult(release)).toMatchObject({ payload: FEATURED_PAYLOAD, blockTimeMilliseconds: FEATURED_BLOCK_TIME_MS });
  });
});
