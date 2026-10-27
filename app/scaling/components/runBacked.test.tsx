import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import runFixture from '../runs/fixtures/synthetic.json';
import { getTestRunsWithStatus, type BenchmarkRuns } from '../runs/lib/types';
import { toUnifiedRun, type LoadRun } from '../runs/lib/unified';
import type { Run } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { AREAS } from './CeilingCards';
import { RunBackedCeilingCard } from './RunBackedCeilingCard';
import { DaWorkloads } from './DaWorkloads';
import { Progress } from './Progress';
import { RelatedRuns } from './RelatedRuns';

// Synthetic data only: real snapshots and runs are internal and never committed.
const swr = vi.hoisted(() => ({ byKey: {} as Record<string, object> }));
vi.mock('swr', () => ({ default: (key: unknown) => (key === null ? {} : swr.byKey[Array.isArray(key) ? key[0] : String(key)] ?? {}) }));

const snapshot = (): Snapshot => JSON.parse(readFileSync(new URL('../fixtures/synthetic.v2.json', import.meta.url), 'utf8'));
const metadata = runFixture.metadata as BenchmarkRuns;
const [bench] = metadata.runs;
const cards = (html: string) => html.split('rounded-2xl').slice(1);

beforeEach(() => {
  swr.byKey = {};
});

describe('execution ceiling', () => {
  it('shows the newest passing bench run as an estimate with its reason and a link, without making it binding', () => {
    const older = { ...bench, id: 'old', createdAt: '2025-11-01T00:00:00Z', testConfig: { ...bench.testConfig, BenchmarkRun: 'test-old' }, result: { ...bench.result!, sequencerMetrics: { ...bench.result!.sequencerMetrics!, gasPerSecond: 99e6 } } };
    const fasterConfig = { ...bench, outputDir: 'synthetic-1b', result: { ...bench.result!, sequencerMetrics: { ...bench.result!.sequencerMetrics!, gasPerSecond: 48e6 } } };
    swr.byKey['scaling-bench-metadata'] = { data: { runs: [older, bench, fasterConfig, metadata.runs[1]] } };
    const { ceilings } = snapshot();
    ceilings[0].value = 70; // DA modeled above the run's 48 Mgas/s.
    const [da, execution] = cards(renderToStaticMarkup(<>{AREAS.map(([area]) => <RunBackedCeilingCard key={area} area={area} ceilings={ceilings} />)}</>));
    expect(execution).toMatch(/>48<\/span>.*?>Estimated</);
    expect(execution).toContain('state size not recorded');
    expect(execution).toContain('href="/scaling/runs/bench/test-synthetic-1"');
    expect(execution).toContain('bench_run · test-synthetic-1 · observed · 2026-01-07');
    expect(execution).not.toContain('>Binding<');
    expect(da).toContain('>Binding<');
  });

  it('falls back to the snapshot when the run API is unavailable', () => {
    swr.byKey['scaling-bench-metadata'] = { error: new Error('not configured') };
    const [, execution] = cards(renderToStaticMarkup(<>{AREAS.map(([area]) => <RunBackedCeilingCard key={area} area={area} ceilings={snapshot().ceilings} />)}</>));
    expect(execution).toMatch(/>150<\/span>.*?>Estimated</);
    expect(execution).toContain('state size not recorded for the run');
    expect(execution).not.toContain('/scaling/runs/bench/');
  });

  it('keeps a measured snapshot value over a run estimate', () => {
    swr.byKey['scaling-bench-metadata'] = { data: metadata };
    const { ceilings } = snapshot();
    Object.assign(ceilings[1], { value: 60, tag: 'measured' });
    const [, execution] = cards(renderToStaticMarkup(<>{AREAS.map(([area]) => <RunBackedCeilingCard key={area} area={area} ceilings={ceilings} />)}</>));
    expect(execution).toMatch(/>60<\/span>.*?>Measured<.*?>Binding</);
  });
});

it('lists the newest runs of each kind covering an area', () => {
  const nightly = Array.from({ length: 6 }, (_, i) => ({ network: 'sepolia', timestamp: `2026-02-0${i + 1}T00-00-00` }));
  const runs = [...getTestRunsWithStatus(metadata), ...(runFixture.loadTests as unknown as LoadRun[]), ...nightly].map(toUnifiedRun).sort((a, b) => b.timestamp - a.timestamp);
  swr.byKey['scaling-runs'] = { data: { runs, loadTotal: 3 } };
  const links = (area: 'execution' | 'da' | 'state') => [...renderToStaticMarkup(<RelatedRuns area={area} />).matchAll(/href="(\/scaling\/runs\/[^"]+)"/g)].map((m) => m[1]);
  const newestLoads = runs.filter((r) => r.kind === 'load').slice(0, 5).map((r) => r.href);
  expect(links('execution')).toEqual([...newestLoads, '/scaling/runs/bench/test-synthetic-1', '/scaling/runs/bench/test-synthetic-2']);
  expect(links('da')).toEqual(newestLoads);
  expect(links('state')).toEqual([]);
});

it('shows gas/s and status for evidence that points at a run page', () => {
  swr.byKey['scaling-bench-metadata'] = { data: metadata };
  swr.byKey['scaling-load-result'] = { data: runFixture.loadTests[0].result };
  const [item] = snapshot().work;
  const at = (url: string) => renderToStaticMarkup(<Progress work={[{ ...item, evidence: { label: 'Run', url } }]} />);
  expect(at('https://example.com/scaling/runs/bench/test-synthetic-1')).toMatch(/42\.0 Mgas\/s.*?success/);
  expect(at('https://example.com/scaling/runs/load/sepolia/2026-01-08T00-00-01')).toMatch(/12\.5 Mgas\/s.*?success/);
  expect(at('https://example.com/synthetic/doc')).not.toContain('Mgas/s');
});

describe('DA from bench runs', () => {
  const da = (frame_bytes: number, withinTarget: boolean | null): Run['da'] => ({
    result: { seconds: 600, gas_used: 4e10, transactions: 1e6, transaction_bytes: 0, frame_bytes, gas_per_second: 1.9e8, bytes_per_gas: 0, compression_ratio: 0, blobs_per_l1_slot: 15.5, blob_fill: 1, blob_target_gas_per_second: 0 },
    target: 14,
    withinTarget,
  });
  const run = (workload: Run['workload'], runDa: Run['da']): Run => ({
    id: `synthetic-${workload}`, outputDir: `synthetic-${workload}`, workload, mgas: 200, gps: 2e8, tps: 4000, passed: true,
    commit: 'c0ffee', createdAt: Date.parse('2026-01-05T00:00:00Z'), steps: [], replay: null, proofNode: null, da: runDa,
  });
  const rows = (html: string) => html.split('<tr').slice(2);

  it('keeps the estimates without a bench DA run', () => {
    const html = rows(renderToStaticMarkup(<DaWorkloads observedP50={null} benchUrl="https://bench.example.com" />));
    expect(html[0]).toMatch(/>~100<.*>Estimated<.*b20-transfer.*, pending/);
    expect(html[0]).toContain('>—<');
  });

  it('switches a payload to measured with its run link, and shows blobs per slot against the target', () => {
    swr.byKey['scaling-proven-capacity'] = { data: { da: { payment: run('payment', da(8e7, false)), swap: null, mix: run('mix', da(4e7, null)) } } };
    const html = rows(renderToStaticMarkup(<DaWorkloads observedP50={null} benchUrl="https://bench.example.com" />));
    expect(html[0]).toMatch(/>80<.*>40,000<.*>Measured<.*href="\/scaling\/runs\/bench\/synthetic-payment"[^>]*>bench 200 Mgas\/s run</);
    expect(html[0]).toMatch(/15\.5 \/ 14<span[^>]*>over</);
    expect(html[1]).toContain('>Estimated<');
    expect(html[2]).toContain('>155<');
    expect(html[2]).toMatch(/15\.5 \/ 14<\/span>/);
  });
});
