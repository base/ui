import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import fixture from '../../../fixtures/synthetic.json';
import { LoadRun } from './LoadRun';

const swr = vi.hoisted(() => ({ result: {} as object, list: {} as object }));
vi.mock('swr', () => ({ default: (key: string[]) => (key[0] === 'scaling-load-list' ? swr.list : swr.result) }));

const [newest, middle, oldest] = fixture.loadTests;
swr.list = { data: fixture.loadTests.map(({ network, timestamp }) => ({ network, timestamp })) };
const render = (timestamp: string) => renderToStaticMarkup(<LoadRun network="sepolia" timestamp={timestamp} />);

it('leads with observed Mgas/s, the workload translation and the key knobs', () => {
  swr.result = { data: { ...newest.result, throughput_timeseries: [{ elapsed_secs: 1, tps: 30, gps: 12e6 }, { elapsed_secs: 2, tps: 33, gps: 13e6 }] } };
  const html = render(middle.timestamp);
  expect(html).toContain('href="/scaling/runs"');
  expect(html).toMatch(/12\.5<\/span> <span[^>]*>Mgas\/s observed/);
  // 375M gas over 990 confirmed txs is about 378,788 gas each; 12.5M gas/s / 378,788 ≈ 33 tx/s.
  expect(html).toContain('≈ 33 tx/s at this mix: transfer (75%) · swap (25%)');
  expect(html).toContain('target 15 Mgas/s');
  expect(html).toContain('10 senders');
  expect(html).toContain('4 in flight each');
  expect(html).toContain('aria-label="Gas per second"');
  expect(html).toContain('Flashblocks latency · 10 samples');
  expect(html).toMatch(/p99<\/span>.*?3\.0 s/);
  expect(html).toContain('No failures recorded.');
});

it('steps to the older and newer neighbours', () => {
  const html = render(middle.timestamp);
  expect(html).toContain(`href="/scaling/runs/load/sepolia/${oldest.timestamp}">← Previous run`);
  expect(html).toContain(`href="/scaling/runs/load/sepolia/${newest.timestamp}">Next run →`);
  expect(render(newest.timestamp)).toContain('<span class="text-bds-gray-40">Next run →</span>');
});

it('shows a fatal run without metrics', () => {
  swr.result = { data: oldest.result };
  const html = render(oldest.timestamp);
  expect(html).toContain('synthetic fatal error');
  expect(html).not.toContain('Mgas/s observed');
});
