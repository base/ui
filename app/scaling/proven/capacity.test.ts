import { expect, it } from 'vitest';

import { loadProvenCapacity, PAYLOADS, type Workload } from './capacity';

const NOW = Date.parse('2026-02-01T00:00:00Z');
const DAY = 86_400_000;
const HTML = '<!doctype html><html></html>';

type Spec = {
  dir: string;
  mgas: number;
  daysAgo: number;
  workload?: Workload;
  ref?: string | null;
  comparable?: boolean;
  delivered?: number;
  scenario?: string;
  benchmarkRun?: string;
  fail?: string;
  // false: written before the step pipeline, so no pipeline-result.json.
  pipeline?: boolean;
  missing?: string[];
  // Older load-test-result.json files have no block_latency.
  noLatency?: boolean;
  withinTarget?: boolean | null;
};

const LATENCY = { meanMs: 3, p50Ms: 2, p99Ms: 9, maxMs: 12 };
const STEPS = (s: Spec) => [
  { name: 'sequencer', enabled: true, status: 'passed', reason: null, durationSeconds: 900, outputs: {} },
  { name: 'validator_replay', enabled: true, status: s.comparable === false ? 'failed' : 'passed', reason: s.comparable === false ? 'replay mismatch' : null, durationSeconds: 130, outputs: {} },
  { name: 'da', enabled: true, status: 'passed', reason: null, durationSeconds: 20, outputs: { target: 14, blobsPerL1Slot: 15.5, blobTargetGasPerSecond: 1.9e8, withinTarget: s.withinTarget === undefined ? false : s.withinTarget } },
  { name: 'tee_proof', enabled: false, status: 'not-implemented', reason: 'needs a synthetic L1' },
];
const REPLAY = { blocksPerSecond: 36.4, newPayload: LATENCY, forkchoice: LATENCY, match: true, blocks: [{ number: 1 }] };
const PROOFS = {
  headLagBlocks: { samples: 3000, p50: 1, p99: 4, max: 9 },
  failedProbes: 0,
  methods: { debug_executePayload: { errors: 0, latency: LATENCY } },
  witnessBytes: { samples: 3000, p50: 4096, p99: 8192, max: 9000 },
};
const DA = { seconds: 600, gas_used: 6e10, transactions: 1e6, transaction_bytes: 1.5e8, frame_bytes: 6e7, gas_per_second: 1e8, bytes_per_gas: 0.001, compression_ratio: 2.5, blobs_per_l1_slot: 15.5, blob_fill: 0.98, blob_target_gas_per_second: 1.5e8 };
const STORAGE = {
  diskBudgetBytes: 45e12,
  archive: { growthBytesPerYear: 1e14, growthBound: 'lower', currentBytes: null, runwayYears: null, runwayBound: 'upper' },
  fullNode: { stateGrowthBytesPerYear: 1e10, historyFootprintBytes: 9e12, historyFootprintBound: 'lower', proofFootprintBytes: 2e12 },
};

// Run outputs are cached by outputDir across calls, so every test uses its own dirs.
function load(specs: Spec[]) {
  const metadata = {
    runs: specs.map((s) => ({
      outputDir: s.dir,
      createdAt: new Date(NOW - s.daysAgo * DAY).toISOString(),
      testConfig: {
        BenchmarkRun: s.benchmarkRun ?? `run-${s.dir}`,
        ChainId: 8453,
        Scenario: s.scenario ?? `sustained-${s.mgas}mgas`,
        TransactionPayload: PAYLOADS[s.workload ?? 'mix'],
      },
      result: { success: true },
    })),
  };
  const fetchImpl = async (url: string) => {
    const path = url.replace('https://bench.example/output/', '');
    if (path === 'metadata.json') return Response.json(metadata);
    const [dir, ...rest] = path.split('/');
    const file = rest.join('/');
    const s = specs.find((x) => x.dir === dir)!;
    if (s.fail === file) return new Response('error', { status: 500 });
    if (s.missing?.includes(file) || (file === 'pipeline-result.json' && s.pipeline === false)) return new Response(HTML);
    const delivered = (s.delivered ?? 1) * s.mgas;
    switch (file) {
      case 'validation.json': return Response.json({ comparable: s.comparable ?? true, reasons: [] });
      case 'load-test-result.json': return Response.json({
        throughput: { gps: delivered * 1e6, tps: delivered * 10, total_submitted: 1000, total_reverted: 155 },
        ...(s.noLatency ? {} : { block_latency: { p50: { secs: 0, nanos: 205_382_593 }, p99: { secs: 1, nanos: 6_265_374 } } }),
      });
      case 'pipeline-result.json': return Response.json({ suite: 'synthetic', comparable: s.comparable ?? true, steps: STEPS(s) });
      case 'replay-result.json': return Response.json(REPLAY);
      case 'proof-node/replay-result.json': return Response.json({ ...REPLAY, blocksPerSecond: 20, proofs: PROOFS });
      case 'da-result.json': return Response.json(DA);
      case 'storage-growth.json': return Response.json(STORAGE);
    }
    if (s.ref === null) return new Response(HTML);
    return Response.json({ source: { repository: 'base/base', ref: s.ref ?? 'main', revision: `rev-${dir}` } });
  };
  return loadProvenCapacity('https://bench.example', fetchImpl as typeof fetch, NOW);
}

it('counts only pipeline runs built from main, with their steps, replays and DA result', async () => {
  const { current, unknown } = await load([
    { dir: 'main-100', mgas: 100, daysAgo: 3 },
    { dir: 'branch-html-200', mgas: 200, daysAgo: 2, ref: null },
    { dir: 'branch-ref-300', mgas: 300, daysAgo: 1, ref: 'feature' },
    { dir: 'pre-pipeline-400', mgas: 400, daysAgo: 1, pipeline: false },
  ]);
  expect(current.mix).toEqual({
    mgas: 100,
    atTop: true,
    run: {
      id: 'run-main-100',
      outputDir: 'main-100',
      workload: 'mix',
      mgas: 100,
      gps: 100e6,
      tps: 1000,
      reverted: 0.155,
      blockLatency: { p50Ms: 205.382593, p99Ms: 1006.265374 },
      passed: true,
      commit: 'rev-main-100',
      createdAt: NOW - 3 * DAY,
      steps: STEPS({ dir: '', mgas: 0, daysAgo: 0 }),
      replay: { blocksPerSecond: 36.4, newPayload: LATENCY, match: true },
      proofNode: { blocksPerSecond: 20, newPayload: LATENCY, match: true, proofs: PROOFS },
      da: { result: DA, target: 14, withinTarget: false },
      storage: STORAGE,
    },
  });
  expect(unknown).toEqual([]);
});

it('keeps each payload separate, with the latest DA run per payload', async () => {
  const { current, da, history, latestAt } = await load([
    { dir: 'pay-mix-400', mgas: 400, daysAgo: 3 },
    { dir: 'pay-b20-200', mgas: 200, daysAgo: 3, workload: 'payment' },
    { dir: 'pay-b20-300', mgas: 300, daysAgo: 2, workload: 'payment', delivered: 0.5 },
    { dir: 'pay-b20-old', mgas: 100, daysAgo: 20, workload: 'payment' },
    { dir: 'pay-swap-100', mgas: 100, daysAgo: 1, workload: 'swap', missing: ['da-result.json'] },
  ]);
  expect(current.mix).toMatchObject({ mgas: 400, run: { outputDir: 'pay-mix-400' } });
  expect(current.payment).toMatchObject({ mgas: 200, atTop: false, run: { tps: 2000 } });
  expect(current.swap).toMatchObject({ mgas: 100, run: { da: null } });
  expect(da.mix?.outputDir).toBe('pay-mix-400');
  expect(da.payment?.outputDir).toBe('pay-b20-300');
  expect(da.swap).toBeNull();
  expect(history.map((s) => s.mgas)).toEqual([400]);
  // The newest counting run, here one without a DA result.
  expect(latestAt).toBe(NOW - DAY);
});

it('fails a run whose pipeline step failed', async () => {
  const { current } = await load([
    { dir: 'step-100', mgas: 100, daysAgo: 3 },
    { dir: 'step-200', mgas: 200, daysAgo: 2, comparable: false },
  ]);
  expect(current.mix).toMatchObject({ mgas: 100, atTop: false });
});

it('keeps a run and its other details when only storage-growth.json fails', async () => {
  const { current, unknown } = await load([{ dir: 'storage-500', mgas: 100, daysAgo: 1, fail: 'storage-growth.json' }]);
  expect(current.mix?.run).toMatchObject({ storage: null, da: { target: 14 }, replay: { match: true } });
  expect(unknown).toEqual([]);
});

it('reads missing replay, proof-node and storage files as null, and an unjudged blob target as null', async () => {
  const { current } = await load([
    { dir: 'partial-100', mgas: 100, daysAgo: 1, missing: ['replay-result.json', 'proof-node/replay-result.json', 'storage-growth.json'], withinTarget: null },
  ]);
  expect(current.mix?.run).toMatchObject({ replay: null, proofNode: null, storage: null, da: { target: 14, withinTarget: null } });
});

it('ignores alias copies and non-sustained scenarios', async () => {
  const { current, unknown } = await load([
    { dir: 'cand-100', mgas: 100, daysAgo: 3 },
    { dir: 'cand-alias-400', mgas: 400, daysAgo: 2, benchmarkRun: 'mainnet-snapshot--latest' },
    { dir: 'cand-glam-200', mgas: 200, daysAgo: 2, scenario: 'glamsterdam-sustained-200mgas' },
    { dir: 'cand-scrape-400', mgas: 400, daysAgo: 2, scenario: 'sustained-400mgas-scrape200ms' },
  ]);
  expect(current.mix).toMatchObject({ mgas: 100, atTop: true });
  expect(unknown).toEqual([]);
});

it('pairs the newest Glamsterdam jobs with main at matching workloads and rates without changing main capacity', async () => {
  const { comparisons, comparisonErrors, current, history, latestAt } = await load([
    { dir: 'main-mix-200-old', mgas: 200, daysAgo: 3 },
    { dir: 'main-mix-200-new', mgas: 200, daysAgo: 1 },
    { dir: 'main-payment-200', mgas: 200, daysAgo: 2, workload: 'payment' },
    { dir: 'glam-mix-200-old', mgas: 200, daysAgo: 2, scenario: 'glamsterdam-sustained-200mgas', ref: 'glamsterdam' },
    { dir: 'glam-mix-200-latest', mgas: 200, daysAgo: 0, scenario: 'glamsterdam-sustained-200mgas', ref: 'feature', comparable: false },
    { dir: 'glam-payment-200', mgas: 200, daysAgo: 1, workload: 'payment', scenario: 'glamsterdam-sustained-200mgas', ref: 'glamsterdam' },
    { dir: 'glam-mix-300', mgas: 300, daysAgo: 1, scenario: 'glamsterdam-sustained-300mgas', ref: 'glamsterdam' },
    { dir: 'main-swap-200', mgas: 200, daysAgo: 1, workload: 'swap' },
  ]);

  expect(comparisons.map(({ workload, mgas, main, glamsterdam }) => [workload, mgas, main.outputDir, glamsterdam.outputDir])).toEqual([
    ['mix', 200, 'main-mix-200-new', 'glam-mix-200-latest'],
    ['payment', 200, 'main-payment-200', 'glam-payment-200'],
  ], 'only the newest exact workload-and-rate matches should appear');
  expect(comparisons[0].glamsterdam.passed).toBe(false, 'the newest run should remain visible even when it does not pass');
  expect(current.mix).toMatchObject({ mgas: 200, run: { outputDir: 'main-mix-200-new' } }, 'Glamsterdam runs must not affect main proven capacity');
  expect(history.map(({ mgas }) => mgas)).toEqual([200], 'Glamsterdam runs must not enter main capacity history');
  expect(latestAt).toBe(NOW - DAY, 'the main freshness timestamp must exclude the newer Glamsterdam run');
  expect(comparisonErrors).toBe(0, 'successful comparisons should have no load errors');
});

it('omits an older comparison when the newest Glamsterdam run cannot be loaded', async () => {
  const { comparisons, comparisonErrors } = await load([
    { dir: 'failed-latest-main-200', mgas: 200, daysAgo: 1 },
    { dir: 'failed-latest-glam-old-200', mgas: 200, daysAgo: 3, scenario: 'glamsterdam-sustained-200mgas' },
    { dir: 'failed-latest-glam-new-200', mgas: 200, daysAgo: 0, scenario: 'glamsterdam-sustained-200mgas', fail: 'load-test-result.json' },
  ]);

  expect(comparisons).toEqual([], 'a failed latest job must not leave an older pair that looks current');
  expect(comparisonErrors).toBe(1, 'the omitted workload-and-rate comparison should be reported once');
});

it('keeps a newer loaded pair when only an older Glamsterdam run fails', async () => {
  const { comparisons, comparisonErrors } = await load([
    { dir: 'older-failure-main-200', mgas: 200, daysAgo: 1 },
    { dir: 'older-failure-glam-old-200', mgas: 200, daysAgo: 3, scenario: 'glamsterdam-sustained-200mgas', fail: 'load-test-result.json' },
    { dir: 'older-failure-glam-new-200', mgas: 200, daysAgo: 0, scenario: 'glamsterdam-sustained-200mgas' },
  ]);

  expect(comparisons.map(({ glamsterdam }) => glamsterdam.outputDir)).toEqual(['older-failure-glam-new-200'], 'the latest loaded Glamsterdam run should remain paired');
  expect(comparisonErrors).toBe(0, 'an older failed job should not mark the latest loaded comparison unavailable');
});

it('fails runs that are not comparable or deliver under 95% of target', async () => {
  const { current } = await load([
    { dir: 'fail-100', mgas: 100, daysAgo: 3 },
    { dir: 'fail-120', mgas: 120, daysAgo: 3, delivered: 0.95 },
    { dir: 'fail-150', mgas: 150, daysAgo: 3, delivered: 0.94 },
    { dir: 'fail-200', mgas: 200, daysAgo: 3, comparable: false },
  ]);
  expect(current.mix).toMatchObject({ mgas: 120, atTop: false, run: { gps: 114e6 } });
});

it('ignores runs older than 14 days', async () => {
  const { current } = await load([
    { dir: 'window-100', mgas: 100, daysAgo: 13 },
    { dir: 'window-200', mgas: 200, daysAgo: 14 },
  ]);
  expect(current.mix).toMatchObject({ mgas: 100, atTop: true });
});

it('uses the latest run at each rate over an older pass', async () => {
  const { current } = await load([
    { dir: 'latest-100', mgas: 100, daysAgo: 5 },
    { dir: 'latest-200-old', mgas: 200, daysAgo: 4 },
    { dir: 'latest-200-new', mgas: 200, daysAgo: 1, comparable: false },
  ]);
  expect(current.mix).toMatchObject({ mgas: 100, atTop: false });
});

it('steps history when proven capacity changes, with compare links', async () => {
  const { history } = await load([
    { dir: 'hist-a', mgas: 100, daysAgo: 12 },
    { dir: 'hist-b', mgas: 200, daysAgo: 8 },
    { dir: 'hist-c', mgas: 200, daysAgo: 4, comparable: false },
  ]);
  expect(history).toEqual([
    { at: NOW - 12 * DAY, mgas: 100, commit: 'rev-hist-a', previousCommit: null, compareUrl: null },
    {
      at: NOW - 8 * DAY,
      mgas: 200,
      commit: 'rev-hist-b',
      previousCommit: 'rev-hist-a',
      compareUrl: 'https://github.com/base/base/compare/rev-hist-a...rev-hist-b',
    },
    {
      at: NOW - 4 * DAY,
      mgas: 100,
      commit: 'rev-hist-a',
      previousCommit: 'rev-hist-b',
      compareUrl: 'https://github.com/base/base/compare/rev-hist-b...rev-hist-a',
    },
  ]);
});

it('dates a drop when the higher pass ages out of the window', async () => {
  const { history } = await load([
    { dir: 'expire-200', mgas: 200, daysAgo: 20 },
    { dir: 'expire-100', mgas: 100, daysAgo: 10 },
  ]);
  expect(history.map(({ at, mgas }) => ({ at, mgas }))).toEqual([
    { at: NOW - 20 * DAY, mgas: 200 },
    { at: NOW - 6 * DAY, mgas: 100 },
  ]);
});

it('marks a run unknown when one of its files fails or its results are missing, keeping the rest', async () => {
  const { current, unknown } = await load([
    { dir: 'iso-100', mgas: 100, daysAgo: 3 },
    { dir: 'iso-200', mgas: 200, daysAgo: 2, fail: 'load-test-result.json' },
    { dir: 'iso-300', mgas: 300, daysAgo: 2, fail: 'da-result.json' },
    { dir: 'iso-400', mgas: 400, daysAgo: 2, missing: ['validation.json'] },
  ]);
  // A failed detail file leaves the run counted, without its details.
  expect(current.mix).toMatchObject({ mgas: 300, atTop: true, run: { replay: null, da: null } });
  expect(unknown.toSorted()).toEqual(['iso-200', 'iso-300', 'iso-400']);
});

it('fetches replay, proof-node and DA files only for proven and latest-DA runs', async () => {
  const fetched: string[] = [];
  const metadata = { runs: ['sel-100', 'sel-200', 'sel-300'].map((dir, i) => ({
    outputDir: dir, createdAt: new Date(NOW - (3 - i) * DAY).toISOString(),
    testConfig: { BenchmarkRun: dir, ChainId: 8453, Scenario: `sustained-${(i + 1) * 100}mgas`, TransactionPayload: 'mainnet-mix' },
  })) };
  const fetchImpl = async (url: string) => {
    const path = url.replace('https://bench.example/output/', '');
    if (path === 'metadata.json') return Response.json(metadata);
    fetched.push(path);
    const [dir, ...rest] = path.split('/');
    const s: Spec = { dir, mgas: Number(dir.slice(4)), daysAgo: 0, comparable: dir !== 'sel-300' };
    const file = rest.join('/');
    if (file === 'validation.json') return Response.json({ comparable: s.comparable });
    if (file === 'load-test-result.json') return Response.json({ throughput: { gps: s.mgas * 1e6, tps: 1 } });
    if (file === 'pipeline-result.json') return Response.json({ steps: STEPS(s) });
    if (file === 'provenance.json') return Response.json({ source: { ref: 'main', revision: 'r' } });
    return Response.json(file === 'da-result.json' ? DA : REPLAY);
  };
  const { current, da } = await loadProvenCapacity('https://bench.example', fetchImpl as typeof fetch, NOW);
  expect(current.mix?.run.outputDir).toBe('sel-200');
  // Without submitted and reverted totals, nothing counts as reverted.
  expect(current.mix?.run.reverted).toBe(0);
  expect(da.mix?.outputDir).toBe('sel-300');
  const details = fetched.filter((p) => /replay-result|da-result/.test(p)).map((p) => p.split('/')[0]);
  expect([...new Set(details)].toSorted()).toEqual(['sel-200', 'sel-300']);
});

it('revalidates the run index instead of trusting a cached copy', async () => {
  const inits = new Map<string, RequestInit | undefined>();
  const fetchImpl = async (url: string, init?: RequestInit) => {
    inits.set(url, init);
    return Response.json({ runs: [] });
  };
  await loadProvenCapacity('https://bench.example', fetchImpl as typeof fetch, NOW);
  expect(inits.get('https://bench.example/output/metadata.json')?.cache).toBe('no-cache');
});

it('reads block latency from load-test-result.json as milliseconds, and its absence as null', async () => {
  const { current } = await load([
    { dir: 'latency-100', mgas: 100, daysAgo: 1 },
    { dir: 'old-200', mgas: 200, daysAgo: 1, noLatency: true, workload: 'swap' },
  ]);
  expect(current.mix?.run.blockLatency).toEqual({ p50Ms: 205.382593, p99Ms: 1006.265374 });
  expect(current.swap?.run.blockLatency).toBeNull();
});
