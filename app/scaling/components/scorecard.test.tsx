import { readFileSync } from 'node:fs';

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProvenCapacity, Run } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { Scorecard } from './Scorecard';

// Synthetic data only: real bench results and snapshots are internal and never committed.
const swr = vi.hoisted(() => ({ result: {} as object, key: undefined as unknown }));
vi.mock('swr', () => ({ default: (key: unknown) => ((swr.key = key), key === null ? {} : swr.result) }));
vi.mock('./Info', () => ({ Info: ({ children }: { children: ReactNode }) => <span className="help">{children}</span> }));

const BENCH = 'https://bench.example.com';
const DAY = 86_400_000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const LATENCY = { p50Ms: 20, p99Ms: 60, maxMs: 90 };
const STEPS: Run['steps'] = [
  { name: 'sequencer', enabled: true, status: 'passed' },
  { name: 'validator_replay', enabled: true, status: 'passed' },
  { name: 'proof_node', enabled: true, status: 'passed' },
  { name: 'tee_proof', enabled: false, status: 'not-implemented', reason: 'needs a synthetic L1' },
];
const daResult = (frame_bytes: number, blobs: number, withinTarget: boolean | null): Run['da'] => ({
  result: { seconds: 600, gas_used: 4e10, transactions: 1e6, transaction_bytes: 0, frame_bytes, gas_per_second: 0, bytes_per_gas: 0, compression_ratio: 0, blobs_per_l1_slot: blobs, blob_fill: 1, blob_target_gas_per_second: 0 },
  target: 14,
  withinTarget,
});
const run = (mgas: number, workload: Run['workload'] = 'mix', da: Run['da'] = null): Run => ({
  id: `synthetic-${workload}-${mgas}`, outputDir: `synthetic-${mgas}`, workload, mgas, gps: (mgas - 5) * 1e6, tps: mgas * 10.5, passed: true,
  commit: 'bbbbbbbbbbbbbbbb', createdAt: T0 + 5 * DAY, steps: STEPS, da,
  replay: { blocksPerSecond: 36.4, newPayload: LATENCY, match: true },
  proofNode: {
    blocksPerSecond: 20, newPayload: LATENCY, match: true,
    proofs: { headLagBlocks: { samples: 10, p50: 1, p99: 4, max: 9 }, failedProbes: 0, methods: { debug_executePayload: { errors: 0, latency: { p50Ms: 200, p99Ms: 733, maxMs: 900 } } }, witnessBytes: { samples: 0, p50: 0, p99: 0, max: 0 } },
  },
});
const none = { mix: null, payment: null, swap: null };
const bench = (mgas: number, atTop: boolean, more: Partial<ProvenCapacity> = {}): ProvenCapacity => ({
  current: { ...none, mix: { mgas, atTop, run: run(mgas, 'mix', daResult(1, 15.5, false)) } },
  da: none,
  history: [
    { at: T0, mgas: 40, commit: 'aaaaaaaaaaaaaaaa', previousCommit: null, compareUrl: null },
    { at: T0 + 5 * DAY, mgas, commit: 'bbbbbbbbbbbbbbbb', previousCommit: 'aaaaaaaaaaaaaaaa', compareUrl: 'https://github.com/base/base/compare/aaaa...bbbb' },
  ],
  unknown: [],
  ...more,
});
const fixture = (): Snapshot => JSON.parse(readFileSync(new URL('../fixtures/synthetic.v2.json', import.meta.url), 'utf8'));
// Sections in page order: A headline, C ladder, B bottleneck bars, D subsystem table.
const render = (props: { benchUrl?: string; dashboardUrl?: string } = { benchUrl: BENCH }, snapshot = fixture()) => {
  const html = renderToStaticMarkup(<Scorecard snapshot={snapshot} {...props} />);
  const [, a, c, b, d] = html.split('<section');
  return { html, a, c, b, d };
};
const text = (html: string) => html.replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'");
const bar = (b: string, label: string) => text(`<li${b.split('<li').find((li) => li.includes(`>${label}<`)) ?? '>'}`);
const row = (d: string, name: string) => text(`<tr${d.split('<tr').find((tr) => tr.includes(`>${name}<`)) ?? '>'}`);

beforeEach(() => {
  swr.result = {};
  swr.key = undefined;
});

describe('without bench data', () => {
  it('fetches nothing without a URL and falls back to the snapshot and DA estimates', () => {
    const { a, c, b, d } = render({});
    expect(swr.key).toBeNull();
    expect(text(a)).toContain('Proven capacity—Not established');
    expect(text(a)).toContain('Used today12.5Mgas/s median · p99 not measured · 24 h');
    expect(text(a)).toContain('Headroom—');
    expect(text(a)).toContain("First limit: DA. Ethereum's blob target fills at ~57 Mgas/s of payments Estimated or 190 Mgas/s of mainnet-like traffic Measured.");
    expect(text(a)).toContain('1 Mgas/s ≈ 19 payments/s ≈ swaps/s pending');
    expect(text(c)).toContain('0 – 200 Mgas/s');
    expect(text(c)).not.toContain('proven');
    expect(bar(b, 'DA · Payments (B20)')).toContain('~57Estimated· binding');
    expect(bar(b, 'Execution (sequencer)')).toContain('no proven run');
    expect(bar(b, 'Validators')).toContain('pending');
    expect(text(d)).toContain('Measured at the proven rate');
    expect(row(d, 'Validator replay')).toContain('production lag 3 blocks');
    expect(d).not.toContain('Qualified by');
  });

  it('uses a qualified snapshot rung and links the runs behind it', () => {
    const snapshot = fixture();
    snapshot.ladder.qualified = { ...snapshot.ladder.qualified, value: 30, tag: 'measured', evidence: [{ label: 'Synthetic run', url: 'https://example.com/scaling/runs/bench/synthetic-1' }] };
    const { a, c } = render({}, snapshot);
    expect(text(a)).toContain('Proven capacity30Mgas/s · from the snapshot · Synthetic run');
    expect(a).toContain('href="https://example.com/scaling/runs/bench/synthetic-1"');
    expect(text(a)).toContain('Headroom2.4×');
    expect(text(c)).toContain('proven 30');
  });

  it('says so while loading and after a failed fetch, ignoring stale data', () => {
    expect(text(render().a)).toContain('Loading bench results…');
    expect(swr.key).toEqual(['scaling-proven-capacity', BENCH]);
    swr.result = { error: new TypeError('Failed to fetch'), data: bench(400, true) };
    const { a, c } = render();
    expect(text(a)).toContain('VPN');
    expect(text(a)).toContain('Proven capacity—');
    expect(text(c)).not.toContain('proven');
  });

  it('shows when no run counts, and warns when run files failed to load', () => {
    swr.result = { data: { current: none, da: none, history: [], unknown: [] } };
    expect(text(render().a)).toContain('No main run passed in the last 14 days.');
    swr.result = { data: { current: none, da: none, history: [], unknown: ['r1', 'r2'] } };
    expect(text(render().a)).toContain('2 run(s) could not be loaded');
  });
});

describe('with a proven run', () => {
  it('heads with proven, used and headroom, names the first limit and the last change', () => {
    swr.result = { data: bench(400, true) };
    const { a } = render();
    expect(text(a)).toContain('Proven capacity≥ 400Mgas/s · sequencer, validators and proof node all pass on mainnet state');
    expect(text(a)).toContain('Headroom32×');
    expect(text(a)).toContain('of mainnet-like traffic Measured, below the proven 400.');
    expect(text(a)).toContain('↑ from 40 Mgas/s on 2026-01-06 · compare');
    expect(a).toContain('href="https://github.com/base/base/compare/aaaa...bbbb"');
  });

  it('draws the ladder from 0 to the proven rate with three bands and five markers, keeping help text', () => {
    swr.result = { data: bench(400, true) };
    const { c } = render({ benchUrl: BENCH, dashboardUrl: 'https://dashboards.example.com/scaling' });
    expect(text(c)).toContain('0 – 400 Mgas/s');
    for (const label of ['used', 'allowed by policy', 'proven, not yet allowed', 'p50 12.5', 'fee target 40', 'gas limit 200', 'proven ≥ 400']) expect(text(c)).toContain(label);
    expect(text(c)).not.toMatch(/DA ·|Ceiling|payments/);
    expect(c).toContain('400 Mgas/s is the highest rate the bench runs');
    expect(c).toContain('href="https://dashboards.example.com/scaling"');
  });

  it('bars each subsystem on the same scale and highlights the lowest', () => {
    swr.result = { data: bench(400, true) };
    const { b } = render();
    expect(bar(b, 'Execution (sequencer)')).toContain('≥ 400 · top rate tested');
    expect(bar(b, 'Validators')).toContain('≥ 400 · 7.3× replay headroom');
    expect(bar(b, 'Proof node')).toContain('≥ 400 · lag p99 4 blocks');
    expect(b.match(/bg-bds-red-60/g)).toHaveLength(1);
    expect(bar(b, 'DA · Payments (B20)')).toContain('binding');
    expect(text(b)).toContain('today p50 12.5');
    expect(text(b)).toContain('gas limit 200');
    expect(text(b)).toContain('State joins once a runway is chosen.');
  });

  it('binds below the top rate when the proven rate is under every DA ceiling', () => {
    swr.result = { data: bench(40, false) };
    const { a, b } = render();
    expect(text(a)).toContain('Proven capacity40');
    expect(text(a)).toContain('First limit: above 40 Mgas/s, where the next rate tested did not pass.');
    expect(bar(b, 'Execution (sequencer)')).toMatch(/40· binding$/);
  });

  it('lists measured values, budgets, headroom and status per subsystem, with the run evidence', () => {
    swr.result = { data: bench(400, true) };
    const { d } = render();
    expect(text(d)).toContain('Measured at 400 Mgas/s');
    expect(row(d, 'Sequencer')).toBe('Sequencer395.0 Mgas/s delivered≥ 95% of target—pass');
    expect(row(d, 'Validator replay')).toBe('Validator replay36.4 blocks/s, newPayload p99 60 ms; production lag 3 blocks≥ 5 blocks/s; production lag ≤ 3 blocks7.3×pass');
    expect(row(d, 'Proof node')).toBe('Proof nodelag p99 4 blocks; executePayload p99 733 mspending—budget pending');
    expect(row(d, 'DA (bench mix)')).toBe('DA (bench mix)15.5 blobs per L1 slot14 blobs0.9×over target');
    expect(row(d, 'State (full node)')).toBe('State (full node)pending45 TB—runway pending');
    expect(text(d)).toContain('TEE proving, RPC under syncnot measured yet');
    for (const href of ['/scaling/execution', '/scaling/da', '/scaling/state']) expect(d).toContain(`href="${href}"`);
    expect(text(d)).toContain('Qualified by synthetic-400: 400 Mgas/s run delivered 395.0 Mgas/s');
    expect(d).toMatch(/bg-bds-green-50"><\/span>validator replay passed</);
  });

  it('estimates state growth at the proven rate once bytes per gas is known', () => {
    swr.result = { data: bench(400, true) };
    const snapshot = fixture();
    const state = snapshot.ceilings.find((c) => c.area === 'state')!;
    state.inputs = state.inputs.map((i) => (i.name === 'state_bytes_per_gas' ? { ...i, value: 0.001, status: 'observed' } : i));
    expect(row(render({ benchUrl: BENCH }, snapshot).d, 'State (full node)')).toBe('State (full node)~12.6 TB/yr at 400 Estimated45 TB~3.6 yrrunway pending');
  });

  it('switches DA bars to measured once payments and swaps have bench DA runs', () => {
    swr.result = { data: bench(400, true, { da: { mix: null, payment: run(200, 'payment', daResult(8e7, 20, false)), swap: run(200, 'swap', daResult(4e7, 9, true)) } }) };
    const { a, b } = render();
    expect(bar(b, 'DA · Payments (B20)')).toContain('76Measured· binding');
    expect(bar(b, 'DA · Swaps')).toContain('152Measured');
    expect(text(a)).toContain('fills at 76 Mgas/s of payments Measured');
  });

  it('translates to bench payments/s and swaps/s, pending without a qualifying run', () => {
    swr.result = { data: bench(400, true, { current: { mix: null, swap: null, payment: { mgas: 200, atTop: false, run: run(200, 'payment') } } }) };
    expect(render().a).toContain('<a class="underline" href="/scaling/runs/bench/synthetic-payment-200">≥ 2,100 payments/s (B20 transfers)</a> · swaps/s (Uniswap v3) pending');
  });
});
