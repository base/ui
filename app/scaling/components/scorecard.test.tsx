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
const run = (mgas: number, workload: Run['workload'] = 'mix', da: Run['da'] = null, lag = 4): Run => ({
  id: `synthetic-${workload}-${mgas}`, outputDir: `synthetic-${mgas}`, workload, mgas, gps: (mgas - 5) * 1e6, tps: mgas * 10.5, reverted: 0, storage: null, passed: true,
  commit: 'bbbbbbbbbbbbbbbb', createdAt: T0 + 5 * DAY, steps: STEPS, da,
  replay: { blocksPerSecond: 36.4, newPayload: LATENCY, match: true },
  proofNode: {
    blocksPerSecond: 20, newPayload: LATENCY, match: true,
    proofs: { headLagBlocks: { samples: 10, p50: 1, p99: lag, max: 20 }, failedProbes: 0, methods: { debug_executePayload: { errors: 0, latency: { p50Ms: 200, p99Ms: 733, maxMs: 900 } } }, witnessBytes: { samples: 0, p50: 0, p99: 0, max: 0 } },
  },
});
const none = { mix: null, payment: null, swap: null };
const storage = (currentBytes: number | null = null): NonNullable<Run['storage']> => ({
  diskBudgetBytes: 45e12,
  archive: { growthBytesPerYear: 5e12, growthBound: 'lower', currentBytes, runwayYears: null, runwayBound: 'upper' },
  fullNode: { stateGrowthBytesPerYear: 1.05e10, historyFootprintBytes: 9.2e12, historyFootprintBound: 'lower', proofFootprintBytes: 2.3e12 },
});
const bench = (mgas: number, atTop: boolean, more: Partial<ProvenCapacity> = {}): ProvenCapacity => ({
  current: { ...none, mix: { mgas, atTop, run: run(mgas) } },
  da: none,
  history: [
    { at: T0, mgas: 40, commit: 'aaaaaaaaaaaaaaaa', previousCommit: null, compareUrl: null },
    { at: T0 + 5 * DAY, mgas, commit: 'bbbbbbbbbbbbbbbb', previousCommit: 'aaaaaaaaaaaaaaaa', compareUrl: 'https://github.com/base/base/compare/aaaa...bbbb' },
  ],
  latestAt: T0 + 5 * DAY,
  unknown: [],
  ...more,
});
const fixture = (): Snapshot => JSON.parse(readFileSync(new URL('../fixtures/synthetic.v2.json', import.meta.url), 'utf8'));
// In page order: the freshness line, then headline, ladder, ranked limits, workloads, guardrails, work.
const render = (props: { benchUrl?: string } = { benchUrl: BENCH }, snapshot = fixture()) => {
  const html = renderToStaticMarkup(<Scorecard snapshot={snapshot} {...props} />);
  const [fresh, head, ladder, ranked, workloads, guardrails, work] = html.split('<section');
  return { html, fresh, head, ladder, ranked, workloads, guardrails, work };
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
// Table rows after a header row (skip 2) or without one (skip 1).
const rows = (html: string, skip = 2) => html.split('<tr').slice(skip).map((r) => text(`<tr${r}`));
const card = (html: string, label: string) => text(`<x${html.split('rounded-lg border').find((c) => c.includes(`>${label}<`)) ?? '>'}`.replace(/<[^>]*$/, ''));

beforeEach(() => {
  swr.result = {};
  swr.key = undefined;
});

describe('freshness and headline', () => {
  it('dates usage, bench and SLOs, dropping the bench part without bench data', () => {
    expect(text(render({}).fresh)).toBe('Usage to 2026-01-02 · SLOs 2026-01-02');
    swr.result = { data: bench(400, true) };
    expect(text(render().fresh)).toBe('Usage to 2026-01-02 · bench 2026-01-06 00:00 UTC · SLOs 2026-01-02');
    expect(render().html).not.toContain('Usage data as of');
  });

  it('heads with proven capacity, today and headroom, and the next bottleneck with its last change', () => {
    swr.result = { data: bench(400, true) };
    const { head } = render();
    expect(text(head)).toContain('Proven capacity≥ 400Mgas/stoday 12.5 median (64 tx/s) · 32×');
    expect(text(head)).toContain('Next bottleneck to solveDA · Payments (B20) at ~57 Mgas/s≈ 1,517 payments/s');
    expect(text(head)).toContain('↑ from 40 Mgas/s on 2026-01-06 · compare');
    expect(text(head)).not.toMatch(/First limit|Payments per second/);
  });

  it('adds blobs per slot to the callout once the binding DA workload has a bench run', () => {
    swr.result = { data: bench(400, true, { da: { mix: null, payment: run(200, 'payment', daResult(8e7, 20, false)), swap: null } }) };
    expect(text(render().head)).toContain('DA · Payments (B20) at 76 Mgas/s≈ 1,896 payments/s · 20.0 blobs/slot vs 14 at 200');
  });

  it('falls back to the snapshot without a bench host, and says so while loading or failed', () => {
    const snapshot = fixture();
    delete snapshot.usage;
    snapshot.ladder.qualified = { ...snapshot.ladder.qualified, value: 30, tag: 'measured', evidence: [{ label: 'Synthetic run', url: 'https://example.com/scaling/runs/bench/synthetic-1' }] };
    const head = text(render({}, snapshot).head);
    expect(head).toContain('Proven capacity30Mgas/stoday 12.5 median · 2.4×');
    expect(head).toContain('Proven capacity from the snapshot · Synthetic run');
    expect(text(render().head)).toContain('Loading bench results…');
    swr.result = { error: new TypeError('Failed to fetch'), data: bench(400, true) };
    expect(text(render().head)).toMatch(/Proven capacity—Mgas\/s.*VPN/);
  });

  it('names the merged core limit when the proven rate is below every DA ceiling', () => {
    swr.result = { data: bench(40, false) };
    expect(text(render().head)).toContain('Execution, validators, proof node at 40 Mgas/sthe next rate tested did not pass');
  });
});

describe('ladder', () => {
  it('shades the used band in two tones at p50 and p99, notches the fee target, and marks the gas limit and proven rate', () => {
    swr.result = { data: bench(400, true) };
    const snapshot = fixture();
    snapshot.ladder.observed.p99 = { ...snapshot.ladder.observed.p99, value: 42.24, tag: 'measured' };
    const { ladder } = render({ benchUrl: BENCH }, snapshot);
    expect(ladder).toMatch(/data-band="p50" width="3.125%"/);
    expect(ladder).toMatch(/data-band="p99" width="10.56%"/);
    expect(ladder).toContain('data-notch="fee"');
    for (const label of ['p50 12.5', 'p99 42.2', 'fee target 40', 'gas limit 200', 'proven ≥ 400', '400 Mgas/s']) expect(text(ladder)).toContain(label);
    expect(text(ladder)).toContain('up to medianmedian to p99allowed by policyproven, not yet allowed');
    expect(text(ladder)).not.toMatch(/DA ·|42\.24|Usage data/);
  });

  it('shades only to p50 without a p99, and draws no used band without either', () => {
    const { ladder } = render({});
    expect(ladder).toMatch(/data-band="p50" width="6.25%"/);
    expect(ladder).not.toContain('data-band="p99"');
    const snapshot = fixture();
    snapshot.ladder.observed.p50 = { ...snapshot.ladder.observed.p50, value: null, tag: 'not-measured' };
    expect(render({}, snapshot).ladder).not.toContain('data-band');
  });
});

describe('what breaks first', () => {
  it('ranks DA estimates first without bench data and leaves unproven limits unranked', () => {
    expect(rows(render({}).ranked)).toEqual([
      '1DA · Payments (B20)next~57 ≈ 1,517/s Estimatedest. · run pending',
      '2DA · Swaps~115 ≈ 799/s Estimatedest. · run pending',
      '3DA · Mainnet mix190 ≈ 981/s Measuredmeasured · base-bench da, mainnet 2 h',
      '—Execution (sequencer)—no proven run',
      '—Validators—pending',
      '—Proof node—pending',
      '—Disk · full node—runway pending',
      '—Disk · archive node—not measured yet',
      '—TEE proving, RPC under sync—not measured yet',
    ]);
  });

  it('merges execution, validators and proof node when they share the proven ceiling, with the run evidence', () => {
    swr.result = { data: bench(400, true) };
    const { ranked } = render();
    expect(rows(ranked)[3]).toBe('4Execution, validators, proof node≥ 400all pass at 400');
    expect(ranked.match(/>next</g)).toHaveLength(1);
    expect(ranked.match(/bg-bds-red-60/g)).toHaveLength(2);
    expect(ranked).toMatch(/border-dashed[^"]*" style="left:50%"/);
    expect(text(ranked)).toContain('Proven by synthetic-400: 400 Mgas/s run delivered 395.0 Mgas/s');
    expect(text(ranked)).not.toContain('Subsystem detail');
  });

  it('splits them when the proof node is over budget, leaving it unranked', () => {
    const over = bench(400, true);
    over.current.mix = { mgas: 400, atTop: true, run: run(400, 'mix', null, 11) };
    swr.result = { data: over };
    expect(rows(render().ranked).slice(3, 6)).toEqual([
      '4Execution (sequencer)≥ 400top rate tested',
      '5Validators≥ 4007.3× replay headroom',
      '—Proof node—over budget at 400 · lag p99 11 blocks',
    ]);
  });

  it('marks the core limit next when it is the lowest ceiling', () => {
    swr.result = { data: bench(40, false) };
    expect(rows(render().ranked)[0]).toBe('1Execution, validators, proof nodenext40all pass at 40');
  });

  it('shows a measured DA workload with its blobs per slot', () => {
    swr.result = { data: bench(400, true, { da: { mix: null, payment: run(200, 'payment', daResult(8e7, 20, false)), swap: null } }) };
    expect(rows(render().ranked)[0]).toBe('1DA · Payments (B20)next76 ≈ 1,896/s Measuredmeasured · 20.0 blobs/slot at 200');
  });
});

describe('by workload', () => {
  it('cards each workload with its proven rate, DA ceiling, replay headroom and proof-node latency', () => {
    swr.result = { data: bench(400, true, { current: { mix: { mgas: 400, atTop: true, run: run(400) }, swap: null, payment: { mgas: 200, atTop: true, run: run(200, 'payment') } } }) };
    const { workloads } = render();
    expect(card(workloads, 'Payments (B20)')).toBe('Payments (B20)≥ 2.1k/sDA~57 · breaks firstValidators7.3×Proof nodelag 4 · 733 msDisk—');
    expect(card(workloads, 'Swaps (Uniswap v3)')).toBe('Swaps (Uniswap v3)pendingDA~115 EstimatedValidators—Proof node—Disk—');
    expect(card(workloads, 'Mainnet mix')).toBe('Mainnet mix≥ 4.2k tx/sbench mixDA190 · breaks firstValidators7.3×Proof nodelag 4 · 733 msDisk—');
  });

  it('keeps the DA tag when the ceiling is above the proven rate', () => {
    swr.result = { data: bench(40, false, { current: { mix: null, swap: null, payment: { mgas: 40, atTop: false, run: run(40, 'payment') } } }) };
    expect(card(render().workloads, 'Payments (B20)')).toContain('420/sDA~57 Estimated');
  });
});

describe('reverts, measured swaps and disk', () => {
  it('counts successful tx/s on workload cards and notes reverts above 1%', () => {
    const reverting = { ...run(200, 'swap'), reverted: 0.155 };
    swr.result = { data: bench(400, true, { current: { mix: null, payment: { mgas: 200, atTop: true, run: { ...run(200, 'payment'), reverted: 0.005 } }, swap: { mgas: 200, atTop: true, run: reverting } } }) };
    const { workloads } = render();
    // 2,100 delivered × 0.845 successful.
    expect(card(workloads, 'Swaps (Uniswap v3)')).toContain('Swaps (Uniswap v3)≥ 1.8k/s16% reverted');
    expect(card(workloads, 'Payments (B20)')).toContain('Payments (B20)≥ 2.1k/sDA');
    expect(card(workloads, 'Payments (B20)')).not.toContain('reverted');
  });

  it('ranks a measured swaps DA ceiling by its value, past the gas limit', () => {
    // 4e10 gas and 2.6158e7 frame bytes put the 14-blob ceiling at ~232 Mgas/s.
    swr.result = { data: bench(400, true, { da: { mix: null, payment: null, swap: run(400, 'swap', daResult(2.6158e7, 22.4, false)) } }) };
    const ranked = render().ranked;
    expect(rows(ranked).slice(0, 4).map((r) => r.slice(0, 22))).toEqual(['1DA · Payments (B20)ne', '2DA · Mainnet mix190 ≈', '3DA · Swaps232 ≈ 5,800', '4Execution, validators']);
    expect(rows(ranked)[2]).toContain('Measuredmeasured · 22.4 blobs/slot at 400');
    const swapsRow = ranked.split('<tr').find((r) => r.includes('>DA · Swaps<'))!;
    expect(swapsRow).toMatch(/style="width:58\.\d+%"/);
    expect(swapsRow).toMatch(/border-dashed[^"]*" style="left:50%"/);
  });

  it('shows full-node and archive disk rows from the mix run, with bounds and no full-node runway', () => {
    const data = bench(400, true);
    data.current.mix = { mgas: 400, atTop: true, run: { ...run(400), storage: storage() } };
    swr.result = { data };
    const [full, archive] = rows(render().ranked).slice(4, 6);
    expect(full).toBe('—Disk · full node—history window ~9.2 TB + proofs ~2.3 TB at 400 Mgas/s (lower bound); state growth per year from this workload: 10.5 GB, from the mainnet mix run. Bench workloads create little new state, so this undercounts mainnet state growth; runway pending.');
    expect(archive).toBe('—Disk · archive node—grows ≥ 5.0 TB/year at 400 Mgas/s (lower bound), from the mainnet mix run');
    expect(full).not.toMatch(/years? left/);
    expect(card(render().workloads, 'Mainnet mix')).toContain('Diskarchive ≥ 5.0 TB/year');
  });

  it('adds an archive runway only when the current archive size is known, and falls back to the newest other workload', () => {
    swr.result = { data: bench(400, true, { current: { mix: null, payment: null, swap: { mgas: 400, atTop: true, run: { ...run(400, 'swap'), storage: storage(35e12) } } } }) };
    expect(rows(render().ranked).find((r) => r.includes('archive node'))).toBe('—Disk · archive node—grows ≥ 5.0 TB/year at 400 Mgas/s (lower bound) · ~2.0 years left of 45.0 TB (upper bound), from the swaps run');
  });
});

describe('guardrails and work', () => {
  it('compresses guardrails to breached, met and not-measured counts with a link', () => {
    const { guardrails } = render({});
    expect(text(guardrails)).toContain('Breached 1 — RPC availability 99.5 %Met 2Not measured 3');
    expect(text(guardrails)).toContain('RPC p99 latencyPropagation p99State growth');
    expect(guardrails).toContain('href="/scaling/guardrails"');
    swr.result = { data: bench(400, true) };
    expect(text(render().guardrails)).toContain('Met 5');
  });

  it('lists work by limit with the binding limit first', () => {
    expect(rows(render({}).work, 1).map((r) => r.slice(0, 12))).toEqual(['DASynthetic ', 'ExecutionSyn']);
    swr.result = { data: bench(40, false) };
    const work = render().work;
    expect(rows(work, 1).map((r) => r.slice(0, 12))).toEqual(['ExecutionSyn', 'DASynthetic ']);
    expect(text(work)).toContain('not estimated');
    expect(text(work)).toContain('Expected effects are not summed.');
  });
});
