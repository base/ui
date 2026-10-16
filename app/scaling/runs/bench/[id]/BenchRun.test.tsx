import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import fixture from '../../fixtures/synthetic.json';
import { CHART_GROUPS } from '../../lib/chartGroups';
import { SORTED_CHART_CONFIG } from '../../lib/metricDefinitions';
import type { BenchmarkRuns } from '../../lib/types';
import { BenchRun } from './BenchRun';

const swr = vi.hoisted(() => ({ meta: {} as object, metrics: {} as object }));
vi.mock('swr', () => ({ default: (key: unknown) => (Array.isArray(key) ? swr.metrics : swr.meta) }));

const [run, other] = (fixture.metadata as BenchmarkRuns).runs;
const secondConfig = {
  ...run,
  outputDir: 'synthetic-1b',
  testConfig: { ...run.testConfig, GasLimit: 200000000 },
  thresholds: { error: { 'validator/latency/new_payload': 25000000 } },
};
swr.meta = { data: { runs: [run, secondConfig, other] } };
const block = (n: number, metrics: Record<string, number>) => ({ BlockNumber: n, ExecutionMetrics: metrics });
swr.metrics = {
  data: [
    [block(1, { 'latency/get_payload': 0.01, 'gas/per_block': 1 }), block(2, { 'latency/get_payload': 0.02, 'gas/per_block': 2 })],
    [block(1, { 'gas/per_block': 1, reth_sync_execution_execution_duration: 0.005 }), block(2, { 'gas/per_block': 2, reth_sync_execution_execution_duration: 0.006 })],
  ],
};

it('shows every configuration of the run with thresholds, role-prefixed ones included, and raw config', () => {
  const html = renderToStaticMarkup(<BenchRun id="test-synthetic-1" />);
  expect(html).toContain('href="/scaling/runs"');
  expect(html).toContain('2 configurations');
  expect(html).toContain('100M gas · 1000 ms blocks');
  expect(html).toContain('200M gas · 1000 ms blocks');
  expect(html).toContain('420.0');
  expect(html).not.toContain('test-synthetic-2');
  expect(html).toMatch(/latency\/get_payload.*?20\.0 ms.*?&gt; 50\.0 ms.*?success/);
  expect(html).toMatch(/validator\/latency\/new_payload.*?30\.0 ms.*?&gt; 25\.0 ms.*?error/);
  expect(html).toMatch(/200M gas · 1000 ms blocks<\/td>.*?<\/tr>/);
  expect(html.match(/200M gas · 1000 ms blocks<\/td>.*?<\/tr>/)![0]).toContain('error');
  expect(html).toContain('&quot;TransactionPayload&quot;: &quot;synthetic-payload&quot;');
});

it('charts sequencer and validator by stage with only the first stage open', () => {
  const html = renderToStaticMarkup(<BenchRun id="test-synthetic-1" />);
  const groups = html.split('<details').slice(1);
  expect(groups.map((g) => g.match(/<summary[^>]*>([^<]+)/)![1].trim())).toEqual(CHART_GROUPS.map(([g]) => g));
  expect(groups.map((g) => g.startsWith(' open=""'))).toEqual([true, false, false, false, false]);
  expect(groups[0]).toContain('Get Payload');
  expect(groups[0]).toMatch(/Gas Per Block.*?sequencer.*?validator/);
  expect(groups[4]).toContain('Reth Sync Execution Duration');
  expect(groups[3]).toContain('No data for this stage in this run.');
});

it('assigns every metric to exactly one stage', () => {
  const assigned = CHART_GROUPS.flatMap(([, metrics]) => metrics);
  expect(assigned.toSorted()).toEqual(SORTED_CHART_CONFIG.map(([key]) => key).toSorted());
});

it('says when no run has the id', () => {
  expect(renderToStaticMarkup(<BenchRun id="missing" />)).toContain('No base-bench run has id missing.');
});
