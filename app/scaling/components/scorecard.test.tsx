import { readFileSync } from 'node:fs';

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProvenCapacity, Run } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { sustainable } from './Headline';
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
  bytesPerGas: { history: 0.0086, proofs: 0.0045, archive: 0.0086 },
  current: { state: 1.1e12 },
  archive: { growthBytesPerYear: 5e12, growthBound: 'lower', currentBytes, runwayYears: null, runwayBound: 'upper' },
  fullNode: {
    stateGrowthBytesPerYear: 1.05e10, historyWindowSeconds: 2_678_400, historyFootprintBytes: 9.2e12, historyFootprintBound: 'lower',
    proofWindowSeconds: 1_296_000, proofFootprintBytes: 2.3e12,
  },
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
  const [fresh, head, ladder, ranked, subsystems, guardrails, work] = html.split('<section');
  return { html, fresh, head, ladder, ranked, subsystems, guardrails, work };
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
// Table rows after a header row (skip 2) or without one (skip 1), without the mocked help popovers.
const rows = (html: string, skip = 2) => html.replace(/ ?<span class="help">[^<]*<\/span>/g, '').split('<tr').slice(skip).map((r) => text(`<tr${r}`));
// A header tile, found by text in its label.
const tile = (head: string, label: string) => text(`<x${head.split('rounded-lg border').find((c) => c.includes(label)) ?? '>'}`.replace(/<[^>]*$/, ''));

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
    expect(text(head)).toContain('≥ 400Mgas/stoday 12.5 (64 tx/s) · 32×');
    expect(text(head)).toContain('Next bottleneck to solveDA · Payments (B20) at ~57 Mgas/s≈ 1,517 payments/s');
    expect(text(head)).toContain('↑ from 40 Mgas/s on 2026-01-06 · compare');
    expect(text(head)).not.toMatch(/First limit|Payments per second|In transactions/);
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
    expect(head).toContain('30Mgas/stoday 12.5 · 2.4×');
    expect(head).toContain('Proven capacity from the snapshot · Synthetic run');
    expect(text(render().head)).toContain('Loading bench results…');
    swr.result = { error: new TypeError('Failed to fetch'), data: bench(400, true) };
    expect(text(render().head)).toMatch(/per second\.—Mgas\/s.*VPN/);
  });

  it('names the merged core limit when the proven rate is below every DA ceiling', () => {
    swr.result = { data: bench(40, false) };
    expect(text(render().head)).toContain('Execution, validators, proof node at 40 Mgas/sthe next rate tested did not pass');
  });
});

describe('workload tiles', () => {
  it('takes the lowest of the proven, DA and gas-limit ceilings, preferring DA then the gas limit on ties', () => {
    expect(sustainable(400, 82, 200)).toEqual({ mgas: 82, cap: 'DA' });
    expect(sustainable(400, 232, 200)).toEqual({ mgas: 200, cap: 'gas limit' });
    expect(sustainable(40, 82, 200)).toEqual({ mgas: 40, cap: 'execution' });
    expect(sustainable(200, 200, 200)).toEqual({ mgas: 200, cap: 'DA' });
    expect(sustainable(300, 400, 300)).toEqual({ mgas: 300, cap: 'gas limit' });
    expect(sustainable(300, 400, null)).toEqual({ mgas: 300, cap: 'execution' });
  });

  it('converts proven and sustainable rates with each proven run’s gas per successful tx, and today’s mix with mainnet gas per tx', () => {
    swr.result = { data: bench(400, true, { current: { mix: { mgas: 400, atTop: true, run: run(400) }, swap: null, payment: { mgas: 200, atTop: true, run: run(200, 'payment') } } }) };
    const { head } = render();
    // 195 Mgas/s ÷ 2,100 tx/s = 92,857 gas per tx; DA payments ~57.3 Mgas/s.
    expect(tile(head, 'Payments (B20)')).toMatch(/≥ 2\.2k\/ssustainable today 617\/s.*capped by DA$/);
    expect(tile(head, 'Swaps (Uniswap v3)')).toContain('pendingsustainable today pending');
    // 12.5 Mgas/s ÷ 64.2 tx/s = ~195k gas per tx on mainnet; DA mix ~190 Mgas/s.
    expect(tile(head, 'traffic mix')).toMatch(/≥ 2\.1k\/s \(32×\)sustainable today 974\/s \(15×\).*capped by DA/);
    expect(tile(head, 'traffic mix')).toContain("At today's mainnet average of ~195k gas per transaction (12.5 Mgas/s ÷ 64 tx/s), not the bench mix.");
  });

  it('caps swaps at the gas limit once their DA is measured above it, with successful tx/s and the reverted note', () => {
    const swap = { ...run(400, 'swap'), reverted: 0.155 };
    swr.result = { data: bench(400, true, { current: { mix: null, payment: null, swap: { mgas: 400, atTop: true, run: swap } }, da: { mix: null, payment: null, swap: run(400, 'swap', daResult(2.6158e7, 22.4, false)) } }) };
    expect(tile(render().head, 'Swaps (Uniswap v3)')).toMatch(/≥ 3.6k\/ssustainable today.*capped by gas limit16% reverted/);
    expect(tile(render().head, 'Swaps (Uniswap v3)')).toMatch(/sustainable today 1,797\/s.*capped by gas limit/);
    expect(render().head).toContain('text-bds-orange-60">sustainable today');
  });

  it('caps by execution below every other ceiling, without ≥ below the top rate', () => {
    swr.result = { data: bench(40, false, { current: { mix: null, swap: null, payment: { mgas: 40, atTop: false, run: run(40, 'payment') } } }) };
    expect(tile(render().head, 'Payments (B20)')).toMatch(/Payments \(B20\)480\/ssustainable today 480\/s.*capped by execution$/);
  });

  it('keeps the mix tile in gas without the snapshot’s transactions per second', () => {
    swr.result = { data: bench(400, true) };
    const snapshot = fixture();
    delete snapshot.usage;
    const mix = tile(render({ benchUrl: BENCH }, snapshot).head, 'traffic mix');
    expect(mix).toContain('—sustainable today —');
    expect(mix).toContain('stays in gas: today 12.5 Mgas/s');
  });
});

describe('subsystems by workload', () => {
  it('lists replay headroom, proof-node latency and archive growth per workload, with — when missing', () => {
    swr.result = { data: bench(400, true, { current: { mix: { mgas: 400, atTop: true, run: { ...run(400), storage: storage() } }, swap: null, payment: { mgas: 200, atTop: true, run: run(200, 'payment') } } }) };
    expect(rows(render().subsystems)).toEqual([
      'Validators7.3× replay headroom—7.3× replay headroom',
      'Proof nodelag p99 4 · executePayload p99 733 ms—lag p99 4 · executePayload p99 733 ms',
      'Disk · archive——≥ 5.0 TB/year at 400 Mgas/s',
    ]);
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
      '—Disk · full node—needs a bench storage-growth run',
      '—Disk · archive node—needs a bench storage-growth run',
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

describe('reverts, measured swaps and disk', () => {
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

});

describe('disk ceilings', () => {
  const withStorage = (more: Partial<ProvenCapacity> = {}) => {
    const data = bench(400, true, more);
    data.current.mix = { mgas: 400, atTop: true, run: { ...run(400), storage: storage() } };
    return data;
  };
  const disk = (ranked: string, label: string) => rows(ranked).find((r) => r.includes(label))!;

  it('ranks both disk rows by their upper-bound ceilings among the other limits', () => {
    swr.result = { data: withStorage() };
    const { ranked } = render();
    expect(rows(ranked).map((r) => r.slice(0, 26))).toEqual([
      '1DA · Payments (B20)next~5',
      '2DA · Swaps~115 ≈ 799/s Es',
      '3Disk · archive node≤ 151u',
      '4DA · Mainnet mix190 ≈ 981',
      '5Execution, validators, pr',
      '6Disk · full node≤ 553uppe',
      '—TEE proving, RPC under sy',
    ]);
    // (45 TB − 4 TB) ÷ (1e6 × 0.0086 B/gas × 1 year); (45 TB − 1.1 TB state) ÷ (1e6 × (history 31 d + proofs 15 d + 2 years of 0.0008 B/gas state)).
    expect(disk(ranked, 'archive node')).toBe("3Disk · archive node≤ 151upper bound · 1-year runway · archive 4.0 TB on 2026-01-01 (Synthetic archive snapshot) · growth at the mainnet mix run's bytes/gas");
    expect(disk(ranked, 'full node')).toBe("6Disk · full node≤ 553upper bound · 2-year runway · state 1.1 TB now · history 31 d + proofs 15 d at the mainnet mix run's bytes/gas · production state growth 0.0008 B/gas");
  });

  it('explains the runway policy and why the ceilings are upper bounds in help', () => {
    swr.result = { data: withStorage() };
    const help = render().ranked;
    expect(help).toContain('Runway policy: full node 2 years, archive 1 year (Invented runway policy.).');
    expect(help).toContain('is a lower bound, because the sequencer prunes history, so this ceiling is an upper bound.');
    expect(help).toContain("may write more bytes per gas than mainnet traffic does (Base&#x27;s whole archive is 4.0 TB)");
    expect(help).toContain('Archive size: invented size.');
  });

  it('names the missing input and leaves the row unranked', () => {
    swr.result = { data: withStorage() };
    const noPolicy = fixture();
    delete noPolicy.policy;
    expect(disk(render({ benchUrl: BENCH }, noPolicy).ranked, 'archive node')).toBe('—Disk · archive node—needs a runway policy');
    expect(disk(render({ benchUrl: BENCH }, noPolicy).ranked, 'full node')).toBe('—Disk · full node—needs a runway policy');
    const noProduction = fixture();
    delete noProduction.production;
    expect(disk(render({ benchUrl: BENCH }, noProduction).ranked, 'archive node')).toBe('—Disk · archive node—needs the production archive size');
    expect(disk(render({ benchUrl: BENCH }, noProduction).ranked, 'full node')).toBe('—Disk · full node—needs production state growth');
    const data = withStorage();
    data.current.mix!.run.storage = { ...storage(), bytesPerGas: { history: 0.0086, proofs: null, archive: 0.0086 } };
    swr.result = { data };
    expect(disk(render().ranked, 'full node')).toBe('—Disk · full node—needs proof storage growth');
  });

  it('ranks an archive already over budget first', () => {
    swr.result = { data: withStorage() };
    const snapshot = fixture();
    snapshot.production!.archiveBytes!.value = 50e12;
    const { head, ranked } = render({ benchUrl: BENCH }, snapshot);
    expect(rows(ranked)[0]).toMatch(/^1Disk · archive nodenextover budget1-year runway/);
    expect(text(head)).toContain('Next bottleneck to solveDisk · archive node is over budget');
  });

  it('notes a disk ceiling below a tile’s sustainable rate under the tiles', () => {
    const swapDa = run(400, 'swap', daResult(2.6158e7, 22.4, false));
    swr.result = { data: withStorage({ current: { mix: null, payment: null, swap: { mgas: 400, atTop: true, run: run(400, 'swap') } }, da: { mix: null, payment: null, swap: swapDa } }) };
    // Swaps are sustainable to the 200 Mgas/s gas limit, above the ~151 archive ceiling.
    expect(text(render().head)).toContain('Archive disk may cap lower (≤ 151 Mgas/s at 1-year runway)');
    // A half-year archive runway lifts the ceiling to ~302 Mgas/s, above every tile.
    const shortRunway = fixture();
    shortRunway.policy!.runwayYears!.archive = 0.5;
    expect(text(render({ benchUrl: BENCH }, shortRunway).head)).not.toContain('may cap lower');
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
