import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import fixture from './fixtures/synthetic.json';
import { getTestRunsWithStatus, type BenchmarkRuns } from './lib/types';
import { toUnifiedRun, type LoadRun } from './lib/unified';
import RunsPage from './page';

const swr = vi.hoisted(() => ({ value: {} as { data?: unknown; error?: unknown } }));
vi.mock('swr', () => ({ default: () => swr.value }));

const runs = [
  ...getTestRunsWithStatus(fixture.metadata as BenchmarkRuns).map(toUnifiedRun),
  ...(fixture.loadTests as unknown as LoadRun[]).map(toUnifiedRun),
].sort((a, b) => b.timestamp - a.timestamp);

it('lists both families newest first, grouped by week, linking to their detail pages', () => {
  swr.value = { data: { runs, loadTotal: 3 } };
  const html = renderToStaticMarkup(<RunsPage />);
  const order = ['Week of 2026-01-05', '/scaling/runs/load/sepolia/2026-01-08T00-00-01', '/scaling/runs/bench/test-synthetic-1',
    'Week of 2025-12-29', '/scaling/runs/load/sepolia/2026-01-01-00-00-02', '/scaling/runs/load/sepolia/2025-12-31T00-00-03',
    'Week of 2025-12-15', '/scaling/runs/bench/test-synthetic-2'];
  const at = order.map((s) => html.indexOf(s));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect(at).toEqual([...at].sort((a, b) => a - b));
  expect(html).toContain('12.5');
  expect(html).toContain('flashblocks p99 800.0 ms');
  expect(html).toContain('the latest 3 of 3 load tests');
});

it('shows the data-source error', () => {
  swr.value = { error: new Error('Benchmark data source is not configured.') };
  expect(renderToStaticMarkup(<RunsPage />)).toContain('Benchmark data source is not configured.');
});
