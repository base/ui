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
  expect(html).toContain('Main jobs');
  expect(html).toContain('glam-mix-200');
  expect(html).toContain('glam-pay-300');
  expect(html).toContain('main-mix-200');
  expect(html).toContain('main-mix-400');
  expect(html).toContain('2,238.2');
  expect(html).toContain('2,970.6');
  expect(html).toContain('5,942.5');
  expect(html).toContain('TPS / actual Mgas/s');
  expect(html).not.toContain('closest TPS');
  expect(html).not.toContain('TPS gap');
});
