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
// Strip tags until none remain, so a tag split across a removed one cannot survive.
const text = (html: string) => {
  let out = html;
  for (let prev = ''; prev !== out; ) {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  }
  return out.replaceAll('&#x27;', "'");
};
const bar = (b: string, label: string) => text(`<li${b.split('<li').find((li) => li.includes(`>${label}<`)) ?? '>'}`);
const cards = (a: string) => a.split('uppercase tracking-wide').slice(1);
const row = (d: string, name: string) => text(`<tr${d.split('<tr').find((tr) => tr.includes(`>${name}<`)) ?? '>'}`);

beforeEach(() => {
  swr.result = {};
  swr.key = undefined;
});

describe('without bench data', () => {
  it('fetches nothing without a URL and falls back to the snapshot and DA estimates', () => {
    const { a, c, b, d } = render({});
    expect(swr.key).toBeNull();
    expect(text(a)).toContain('64transactions per secondaveraged over the last 30 days');
    expect(text(a)).toContain('5.5M per day · 12.5 Mgas/s median · Usage data as of 2026-01-02');
    expect(text(a)).not.toMatch(/Proven capacity|Used today|Headroom|proven capacity is|payments\/s/);
    const [payments, swaps] = cards(a);
    expect(text(payments)).toContain('Payments per second, provenpendingDA caps at ~1,517Estimated');
    expect(text(swaps)).toContain('Swaps per second, provenpendingDA caps at ~799Estimated');
    expect(a).not.toContain('data-tick');
    expect(text(a)).toContain("First limit: DA. Ethereum's blob target fills at ~57 Mgas/s of payments Estimated or 190 Mgas/s of mainnet-like traffic Measured.");
    expect(text(c)).toContain('200 Mgas/s');
    expect(text(c)).not.toContain('proven');
    expect(bar(b, 'DA · Payments (B20)')).toContain('~57Estimated· binding');
    expect(bar(b, 'Execution (sequencer)')).toContain('no proven run');
    expect(bar(b, 'Validators')).toContain('pending');
    expect(text(d)).toContain('Measured at the proven rate');
    expect(row(d, 'Validator replay')).toContain('production lag 3 blocks');
    expect(d).not.toContain('Qualified by');
  });

  it('heads with gas per second when the snapshot has no transactions per second', () => {
    const snapshot = fixture();
    delete snapshot.usage;
    snapshot.ladder.observed.p99 = { ...snapshot.ladder.observed.p99, value: 42.24, tag: 'measured' };
    const { a } = render({}, snapshot);
    expect(text(a)).toContain('12.5Mgas/s medianaveraged over 24 h');
    expect(text(a)).toContain('42.2 p99 · Usage data as of 2026-01-02');
    expect(text(a)).not.toMatch(/transactions per second|per day/);
  });

  it('uses a qualified snapshot rung and links the runs behind it', () => {
    const snapshot = fixture();
    snapshot.ladder.qualified = { ...snapshot.ladder.qualified, value: 30, tag: 'measured', evidence: [{ label: 'Synthetic run', url: 'https://example.com/scaling/runs/bench/synthetic-1' }] };
    const { a, c } = render({}, snapshot);
    expect(text(a)).toContain('Proven capacity 30 Mgas/s, from the snapshot · Synthetic run');
    expect(a).toContain('href="https://example.com/scaling/runs/bench/synthetic-1"');
    expect(text(a)).toContain('12.5 Mgas/s median · proven capacity is 2.4× that');
    expect(text(c)).toContain('proven 30');
  });

  it('says so while loading and after a failed fetch, ignoring stale data', () => {
    expect(text(render().a)).toContain('Loading bench results…');
    expect(swr.key).toEqual(['scaling-proven-capacity', BENCH]);
    swr.result = { error: new TypeError('Failed to fetch'), data: bench(400, true) };
    const { a, c } = render();
    expect(text(a)).toContain('VPN');
    expect(text(cards(a)[0])).toContain('pending');
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
  it('heads with today, the headroom over the median, the first limit and the last change', () => {
    swr.result = { data: bench(400, true) };
    const { a } = render();
    expect(text(a)).toContain('5.5M per day · 12.5 Mgas/s median · proven capacity is 32× that · Usage data as of 2026-01-02');
    expect(text(a)).toContain('of mainnet-like traffic Measured, below the proven 400.');
    expect(text(a)).toContain('↑ from 40 Mgas/s on 2026-01-06 · compare');
    expect(a).toContain('href="https://github.com/base/base/compare/aaaa...bbbb"');
  });

  it('shades the used band in two tones at p50 and p99, notches the fee target, and marks the gas limit and proven rate', () => {
    swr.result = { data: bench(400, true) };
    const snapshot = fixture();
    snapshot.ladder.observed.p99 = { ...snapshot.ladder.observed.p99, value: 42.24, tag: 'measured' };
    const { c } = render({ benchUrl: BENCH, dashboardUrl: 'https://dashboards.example.com/scaling' }, snapshot);
    // 12.5 / 400 and 42.24 / 400 of the axis.
    expect(c).toMatch(/data-band="p50" width="3.125%"/);
    expect(c).toMatch(/data-band="p99" width="10.56%"/);
    expect(c).toContain('data-notch="fee"');
    for (const label of ['p50 12.5', 'p99 42.2', 'fee target 40', 'gas limit 200', 'proven ≥ 400', 'allowed by policy', 'proven, not yet allowed', '400 Mgas/s']) expect(text(c)).toContain(label);
    expect(text(c)).toContain('up to medianmedian to p99allowed by policyproven, not yet allowedUsage data as of 2026-01-02');
    expect(text(c)).not.toMatch(/DA ·|Ceiling|payments|42\.24/);
    expect(c).toContain('400 Mgas/s is the highest rate the bench runs');
    expect(c).toContain('href="https://dashboards.example.com/scaling"');
  });

  it('shades only to p50 without a p99, and draws no used band without either', () => {
    const { c } = render({});
    expect(c).toMatch(/data-band="p50" width="6.25%"/);
    expect(c).not.toContain('data-band="p99"');
    expect(text(c)).toContain('p50 12.5');
    expect(text(c)).not.toMatch(/p99|median to p99/);
    const snapshot = fixture();
    snapshot.ladder.observed.p50 = { ...snapshot.ladder.observed.p50, value: null, tag: 'not-measured' };
    const empty = render({}, snapshot).c;
    expect(empty).not.toContain('data-band');
    expect(text(empty)).not.toMatch(/p50|up to median/);
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

  it('fails the proof node and validator rows over budget, and drops their bars to unknown', () => {
    const over = bench(400, true);
    const proven = over.current.mix!;
    proven.run.proofNode!.proofs!.headLagBlocks.p99 = 11;
    over.current.mix = proven;
    swr.result = { data: over };
    const snapshot = fixture();
    snapshot.guardrails = snapshot.guardrails.map((g) => (g.id === 'validator-keep-up' ? { ...g, value: 4, status: 'breached' } : g));
    const { b, d } = render({ benchUrl: BENCH }, snapshot);
    expect(row(d, 'Proof node')).toMatch(/0\.9× \/ 1\.4×over budget$/);
    expect(row(d, 'Validator replay')).toMatch(/production lag over budget$/);
    expect(bar(b, 'Proof node')).toContain('over budget at 400 · lag p99 11 blocks');
    proven.run.proofNode!.proofs!.headLagBlocks.p99 = 4;
    proven.run.proofNode!.proofs!.methods.debug_executePayload.latency.p99Ms = 1200;
    expect(row(render().d, 'Proof node')).toMatch(/over budget$/);
  });

  it('binds below the top rate when the proven rate is under every DA ceiling', () => {
    swr.result = { data: bench(40, false) };
    const { a, b } = render();
    expect(text(a)).toContain('proven capacity is 3.2× that');
    expect(text(a)).toContain('First limit: above 40 Mgas/s, where the next rate tested did not pass.');
    expect(bar(b, 'Execution (sequencer)')).toMatch(/40· binding$/);
  });

  it('lists measured values, budgets, headroom and status per subsystem, with the run evidence', () => {
    swr.result = { data: bench(400, true) };
    const { d } = render();
    expect(text(d)).toContain('Measured at 400 Mgas/s');
    expect(row(d, 'Sequencer')).toBe('Sequencer395.0 Mgas/s delivered≥ 95% of target—pass');
    expect(row(d, 'Validator replay')).toBe('Validator replay36.4 blocks/s, newPayload p99 60 ms; production lag 3 blocks≥ 5 blocks/s; production lag ≤ 3 blocks7.3×pass');
    expect(row(d, 'Proof node')).toBe('Proof nodelag p99 4 blocks; executePayload p99 733 ms≤ 10 blocks; ≤ 1000 ms2.5× / 1.4×pass');
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

  it('cards payments and swaps per second with today and the DA cap on a 0 to proven bar', () => {
    swr.result = { data: bench(400, true, { current: { mix: null, swap: { mgas: 100, atTop: false, run: run(100, 'swap') }, payment: { mgas: 200, atTop: true, run: run(200, 'payment') } } }) };
    const [payments, swaps] = cards(render().a);
    expect(payments).toContain('href="/scaling/runs/bench/synthetic-payment-200">≥ 2.1k</a>');
    // Today 64.2 and the DA cap 1,517 tx/s on a 0–2,100 scale.
    expect(payments).toMatch(/data-tick="today"[^>]*left:3\.057\d*%/);
    expect(payments).toMatch(/data-tick="da"[^>]*left:72\.24\d*%/);
    expect(text(payments)).toContain('DA caps at ~1,517Estimated');
    expect(swaps).toContain('>1.1k</a>');
    // The DA cap of ~799 swaps/s sits at 76% of the 1,050 proven.
    expect(swaps).toMatch(/data-tick="da"[^>]*left:76\.0\d*%/);
  });

  it('uses the bench DA run for the cap once measured, and omits the today tick without usage data', () => {
    const daRun = run(200, 'payment', { result: { seconds: 600, gas_used: 4e10, transactions: 1e6, transaction_bytes: 0, frame_bytes: 8e7, gas_per_second: 0, bytes_per_gas: 0, compression_ratio: 0, blobs_per_l1_slot: 20, blob_fill: 1, blob_target_gas_per_second: 0 }, target: 14, withinTarget: false });
    swr.result = { data: bench(400, true, { current: { mix: null, swap: null, payment: { mgas: 200, atTop: true, run: run(200, 'payment') } }, da: { mix: null, payment: daRun, swap: null } }) };
    const snapshot = fixture();
    delete snapshot.usage;
    const [payments] = cards(render({ benchUrl: BENCH }, snapshot).a);
    expect(text(payments)).toContain('DA caps at ~1,896Measured');
    expect(payments).not.toContain('data-tick="today"');
    expect(payments).toContain('data-tick="da"');
  });
});
