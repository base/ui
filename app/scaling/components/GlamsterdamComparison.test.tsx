import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { GlamsterdamComparisonSection } from './GlamsterdamComparison';
import type { Run } from '../proven/capacity';

const run = (id: string, mgas: number, tps: number, gps: number, workload: Run['workload'] = 'mix'): Run => ({
  id,
  outputDir: id,
  workload,
  mgas,
  gps,
  tps,
  reverted: 0,
  passed: true,
  commit: 'abc123',
  createdAt: 1,
  steps: [],
  replay: null,
  proofNode: null,
  da: null,
  storage: null,
  blockLatency: null,
});

it('shows the benchmark source setup message when jobs are unavailable', () => {
  const html = renderToStaticMarkup(<GlamsterdamComparisonSection configured={false} />);
  expect(html).toContain('Benchmark source is not configured.');
});

it('shows Glamsterdam and Main jobs side by side without pairing or TPS-gap calculations', () => {
  const glamsterdamRuns = [run('glam-mix-200', 200, 2238.2, 204.5e6), run('glam-pay-300', 300, 1520, 302e6, 'payment')];
  const mainRuns = [run('main-mix-200', 200, 2970.6, 203e6), run('main-mix-400', 400, 5942.5, 406.5e6)];
  const html = renderToStaticMarkup(
    <GlamsterdamComparisonSection configured glamsterdamRuns={glamsterdamRuns} mainRuns={mainRuns} />,
  );

  expect(html).toContain('Glamsterdam jobs');
  expect(html).toContain('All Main targets');
  expect(html).toContain('All Glamsterdam targets');
  expect(html).toContain('Latest Glamsterdam mix run');
  expect(html).toContain('Latest Main mix run');
  expect(html).toContain('glam-mix-200');
  expect(html).toContain('glam-pay-300');
  expect(html).toContain('main-mix-200');
  expect(html).toContain('main-mix-400');
  expect(html).toContain('2,238.2');
  expect(html).toContain('2,970.6');
  expect(html).toContain('5,942.5');
  expect(html).toContain('Actual Mgas/s');
  expect(html).toContain('Successful TPS');
  expect(html).not.toContain('closest TPS');
  expect(html).not.toContain('TPS gap');
});

/** Verifies highlights select by recency, exclude non-mix runs, and retain the inventory. */
it('highlights the latest mix run rather than the largest target or newest other workload', () => {
  const older = { ...run('older-high-target', 400, 5000, 406e6), createdAt: 1 };
  const newest = { ...run('newest-mix', 100, 1200, 102e6), createdAt: 3, reverted: 0.25 };
  const payment = { ...run('newest-payment', 300, 2000, 302e6, 'payment'), createdAt: 4 };
  const html = renderToStaticMarkup(<GlamsterdamComparisonSection configured glamsterdamRuns={[older, payment, newest]} mainRuns={[]} />);
  const cards = html.slice(0, html.indexOf('All Glamsterdam targets'));
  expect(cards, 'latest mix card uses the newest mix job link').toContain('href="/scaling/runs/bench/newest-mix"');
  expect(cards, 'largest target is not assumed newest').not.toContain('older-high-target');
  expect(cards, 'newer payment does not replace latest mix').not.toContain('newest-payment');
  expect(cards, 'successful TPS excludes 25% reverted').toContain('900 successful TPS');
  expect(cards, 'empty Main has an explicit empty state').toContain('No eligible mix jobs in the last 14 days.');
  expect(html, 'older mix remains in the full inventory').toContain('older-high-target');
  expect(html, 'payment remains in the full inventory').toContain('newest-payment');
});
