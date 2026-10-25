import { expect, it } from 'vitest';

import { loadProvenCapacity } from './capacity';

const NOW = Date.parse('2026-02-01T00:00:00Z');
const DAY = 86_400_000;

type Spec = {
  dir: string;
  mgas: number;
  daysAgo: number;
  ref?: string | null;
  comparable?: boolean;
  delivered?: number;
  scenario?: string;
  benchmarkRun?: string;
  fail?: string;
};

// Run outputs are cached by outputDir across calls, so every test uses its own dirs.
function load(specs: Spec[]) {
  const metadata = {
    runs: specs.map((s) => ({
      outputDir: s.dir,
      createdAt: new Date(NOW - s.daysAgo * DAY).toISOString(),
      testConfig: {
        BenchmarkRun: s.benchmarkRun ?? 'mainnet-snapshot',
        ChainId: 8453,
        Scenario: s.scenario ?? `sustained-${s.mgas}mgas`,
        TransactionPayload: 'mainnet-mix',
      },
      result: { success: true },
    })),
  };
  const fetchImpl = async (url: string) => {
    const path = url.replace('https://bench.example/output/', '');
    if (path === 'metadata.json') return Response.json(metadata);
    const [dir, file] = path.split('/');
    const s = specs.find((x) => x.dir === dir)!;
    if (s.fail === file) return new Response('error', { status: 500 });
    if (file === 'validation.json') return Response.json({ comparable: s.comparable ?? true, reasons: [] });
    if (file === 'load-test-result.json') return Response.json({ throughput: { gps: (s.delivered ?? 1) * s.mgas * 1e6 } });
    if (s.ref === null) return new Response('<!doctype html><html></html>');
    return Response.json({ source: { repository: 'base/base', ref: s.ref ?? 'main', revision: `rev-${dir}` } });
  };
  return loadProvenCapacity('https://bench.example', fetchImpl as typeof fetch, NOW);
}

it('counts only runs built from main', async () => {
  const { current, unknown } = await load([
    { dir: 'main-100', mgas: 100, daysAgo: 3 },
    { dir: 'branch-html-200', mgas: 200, daysAgo: 2, ref: null },
    { dir: 'branch-ref-300', mgas: 300, daysAgo: 1, ref: 'feature' },
  ]);
  expect(current).toEqual({
    mgas: 100,
    atTop: true,
    run: { outputDir: 'main-100', mgas: 100, gps: 100e6, passed: true, commit: 'rev-main-100', createdAt: NOW - 3 * DAY },
  });
  expect(unknown).toEqual([]);
});

it('ignores alias copies and non-sustained scenarios', async () => {
  const { current, unknown } = await load([
    { dir: 'cand-100', mgas: 100, daysAgo: 3 },
    { dir: 'cand-alias-400', mgas: 400, daysAgo: 2, benchmarkRun: 'mainnet-snapshot--latest' },
    { dir: 'cand-glam-200', mgas: 200, daysAgo: 2, scenario: 'glamsterdam-sustained-200mgas' },
    { dir: 'cand-scrape-400', mgas: 400, daysAgo: 2, scenario: 'sustained-400mgas-scrape200ms' },
  ]);
  expect(current).toMatchObject({ mgas: 100, atTop: true });
  expect(unknown).toEqual([]);
});

it('fails runs that are not comparable or deliver under 95% of target', async () => {
  const { current } = await load([
    { dir: 'fail-100', mgas: 100, daysAgo: 3 },
    { dir: 'fail-120', mgas: 120, daysAgo: 3, delivered: 0.95 },
    { dir: 'fail-150', mgas: 150, daysAgo: 3, delivered: 0.94 },
    { dir: 'fail-200', mgas: 200, daysAgo: 3, comparable: false },
  ]);
  expect(current).toMatchObject({ mgas: 120, atTop: false, run: { gps: 114e6 } });
});

it('ignores runs older than 14 days', async () => {
  const { current } = await load([
    { dir: 'window-100', mgas: 100, daysAgo: 13 },
    { dir: 'window-200', mgas: 200, daysAgo: 14 },
  ]);
  expect(current).toMatchObject({ mgas: 100, atTop: true });
});

it('uses the latest run at each rate over an older pass', async () => {
  const { current } = await load([
    { dir: 'latest-100', mgas: 100, daysAgo: 5 },
    { dir: 'latest-200-old', mgas: 200, daysAgo: 4 },
    { dir: 'latest-200-new', mgas: 200, daysAgo: 1, comparable: false },
  ]);
  expect(current).toMatchObject({ mgas: 100, atTop: false });
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

it('marks a run unknown when one of its files fails, keeping the rest', async () => {
  const { current, unknown } = await load([
    { dir: 'iso-100', mgas: 100, daysAgo: 3 },
    { dir: 'iso-200', mgas: 200, daysAgo: 2, fail: 'load-test-result.json' },
  ]);
  expect(current).toMatchObject({ mgas: 100, atTop: true });
  expect(unknown).toEqual(['iso-200']);
});
