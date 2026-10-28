import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';

import { GlamsterdamComparisonSection } from './GlamsterdamComparison';
import type { GlamsterdamPair, Run } from '../proven/capacity';

const run = (id: string, mgas: number, tps: number, gps: number): Run => ({
  id,
  outputDir: id,
  workload: 'mix',
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

it('shows the benchmark source setup message when comparisons are unavailable', () => {
  const html = renderToStaticMarkup(<GlamsterdamComparisonSection configured={false} />);
  expect(html, 'the section should explain why comparison data is unavailable').toContain('Benchmark source is not configured.');
});

it('shows independent targets and measured results for the closest-TPS pair', () => {
  const comparison: GlamsterdamPair = {
    workload: 'mix',
    glamsterdam: run('glamsterdam-200', 200, 2238.2, 204.5e6),
    main: run('main-150', 150, 2000, 150e6),
  };
  const candidates = [run('main-200', 200, 2970.6, 203e6), run('main-400', 400, 5942.5, 406.5e6)];
  const html = renderToStaticMarkup(
    <GlamsterdamComparisonSection configured comparisons={[comparison]} mainCandidates={candidates} />,
  );

  expect(html).toContain('Glamsterdam job');
  expect(html).toContain('Main job · closest TPS');
  expect(html).toContain('Target: 200 Mgas/s');
  expect(html).toContain('Target: 150 Mgas/s');
  expect(html).toContain('2,238.2 TPS · 204.5 Mgas/s actual');
  expect(html).toContain('2,000 TPS · 150 Mgas/s actual');
  expect(html).toContain('238.2 TPS');

  expect(html).toContain('Main candidates · latest eligible run per workload and target');
  expect(html).toContain('main-200');
  expect(html).toContain('main-400');
  expect(html).toContain('5,942.5 TPS');
});
