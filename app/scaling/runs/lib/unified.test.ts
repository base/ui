import { expect, it } from 'vitest';

import fixture from '../fixtures/synthetic.json';
import { getTestRunsWithStatus, type BenchmarkRuns } from './types';
import { toUnifiedRun, weekOf, type LoadRun } from './unified';

const [bench, incomplete] = getTestRunsWithStatus(fixture.metadata as BenchmarkRuns).map(toUnifiedRun);
const [load, legacy, fatal] = (fixture.loadTests as unknown as LoadRun[]).map(toUnifiedRun);

it('maps a bench run without inventing its duration', () => {
  expect(bench).toEqual({
    kind: 'bench',
    href: '/scaling/runs/bench/test-synthetic-1',
    env: 'bench',
    network: null,
    timestamp: Date.parse('2026-01-07T12:00:00Z'),
    commit: null,
    machine: 'synthetic.large',
    state: 'unknown',
    duration: null,
    profile: null,
    workload: 'synthetic-payload',
    gasPerSecond: 42e6,
    latency: [{ label: 'get-payload', seconds: 0.02 }, { label: 'new-payload', seconds: 0.03 }],
    status: 'success',
    areas: ['execution'],
    qualifies: { ok: false, reason: 'duration not recorded; state size not recorded' },
  });
  expect(incomplete).toMatchObject({ status: 'incomplete', machine: null, gasPerSecond: null, latency: [], workload: 'Synthetic incomplete run' });
});

it('maps a load test as a burst with its mix, observed gas/s and p99 latencies', () => {
  expect(load).toMatchObject({
    kind: 'load',
    href: '/scaling/runs/load/sepolia/2026-01-08T00-00-01',
    env: 'sepolia',
    timestamp: Date.UTC(2026, 0, 8, 0, 0, 1),
    duration: 30,
    profile: 'burst',
    workload: '70% transfer · 30% swap · target 15 Mgas/s',
    gasPerSecond: 12.5e6,
    latency: [{ label: 'block p99', seconds: 3 }, { label: 'flashblocks p99', seconds: 0.8 }],
    status: 'success',
    areas: ['execution', 'da', 'networking'],
    qualifies: { ok: false, reason: '30 s burst, needs ≥ 1 h; state size not recorded' },
  });
  expect(legacy).toMatchObject({ timestamp: Date.UTC(2026, 0, 1, 0, 0, 2), workload: '—', profile: 'burst' });
  expect(fatal).toMatchObject({ status: 'fatal', duration: null, profile: null, gasPerSecond: null, latency: [] });
});

it('leaves status unknown when a load result could not be fetched', () => {
  expect(toUnifiedRun({ network: 'sepolia', timestamp: '2026-01-08T00-00-01' })).toMatchObject({ status: null, duration: null });
});

it('groups by the Monday that starts the UTC week', () => {
  expect(weekOf(Date.UTC(2026, 0, 11, 23, 59))).toBe('2026-01-05');
  expect(weekOf(Date.UTC(2026, 0, 12))).toBe('2026-01-12');
});
