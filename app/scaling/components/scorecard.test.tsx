import { readFileSync } from 'node:fs';

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProvenCapacity, Run } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { Guardrails } from './Guardrails';
import { headroomLabel, place, sustainable } from './Headline';
import { layoutPoints, type PlacedPoint, type Point } from './Ladder';
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
  result: { seconds: 600, gas_used: 4e10, transactions: 1e6, transaction_bytes: 0, frame_bytes, gas_per_second: 1.6e8, bytes_per_gas: frame_bytes / 4e10, compression_ratio: 4.5, blobs_per_l1_slot: blobs, blob_fill: 1, blob_target_gas_per_second: 0 },
  target: 14,
  withinTarget,
});
const run = (mgas: number, workload: Run['workload'] = 'mix', da: Run['da'] = null, lag = 4): Run => ({
  id: `synthetic-${workload}-${mgas}`, outputDir: `synthetic-${mgas}`, workload, mgas, gps: (mgas - 5) * 1e6, tps: mgas * 10.5, reverted: 0, storage: null, blockLatency: null, passed: true,
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
// In page order: the freshness line, then headline, ladder, ranked limits, workloads, work.
const render = (props: { benchUrl?: string } = { benchUrl: BENCH }, snapshot = fixture()) => {
  const html = renderToStaticMarkup(<Scorecard snapshot={snapshot} {...props} />);
  const [fresh, head, ladder, ranked, subsystems, work] = html.split('<section');
  return { html, fresh, head, ladder, ranked, subsystems, work };
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
const tile = (head: string, label: string) => text(`<x${head.split('rounded-lg border').slice(1).find((c) => c.includes(label)) ?? '>'}`.replace(/<[^>]*$/, ''));

beforeEach(() => {
  swr.result = {};
  swr.key = undefined;
});

describe('freshness and headline', () => {
  it('dates usage and bench, dropping the bench part without bench data, and no SLOs', () => {
    expect(text(render({}).fresh)).toBe('Usage to 2026-01-02');
    swr.result = { data: bench(400, true) };
    expect(text(render().fresh)).toBe('Usage to 2026-01-02 · bench 2026-01-06 00:00 UTC');
    expect(render().html).not.toContain('Usage data as of');
  });

  it('heads with proven capacity, today and headroom only, leaving the next bottleneck and last change to What breaks first', () => {
    swr.result = { data: bench(400, true) };
    const { head, ranked } = render();
    // 400 proven ÷ 12.5 today = 32×, a floor because 400 is the top rate tested.
    expect(text(head)).toContain("≥ 400Mgas/s≥ 32×Proven capacity ÷ today's median gas rate. What breaks first lists the limits that apply before proven capacity.today 12.5· 64 tx/s");
    expect(text(head)).toContain('proven ≥ 400Payments (B20)');
    expect(text(head)).not.toMatch(/p99|mix DA|archive disk ≤/);
    expect(text(head)).not.toMatch(/Next bottleneck|may cap lower|↑ from|First limit:|Payments per second|In transactions/);
    // The last change sits on the run line under the ranked table.
    expect(text(ranked)).toMatch(/Proven by.*Change↑ from 40 Mgas\/s on 2026-01-06 · compare/);
    expect(ranked).toContain('href="https://github.com/base/base/compare/aaaa...bbbb"');
  });

  it('falls back to the snapshot without a bench host, and says so while loading or failed', () => {
    const snapshot = fixture();
    delete snapshot.usage;
    snapshot.ladder.qualified = { ...snapshot.ladder.qualified, value: 30, tag: 'measured', evidence: [{ label: 'Synthetic run', url: 'https://example.com/scaling/runs/bench/synthetic-1' }] };
    const head = text(render({}, snapshot).head);
    expect(head).toContain('30Mgas/s2.4×');
    expect(head).toContain('today 12.5proven 30');
    expect(head).toContain('Proven capacity from the snapshot · Synthetic run');
    expect(text(render().head)).toContain('Loading bench results…');
    swr.result = { error: new TypeError('Failed to fetch'), data: bench(400, true) };
    expect(text(render().head)).toMatch(/per second\.—Mgas\/s.*VPN/);
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
    // Tiles carry no multiples; the header owns the one multiple.
    expect(tile(head, 'traffic mix')).toMatch(/≥ 2\.1k\/ssustainable today 974\/sHighest.*capped by DA/);
    expect(head.split('rounded-lg border').slice(1).join('')).not.toContain('×');
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

describe('headroom span', () => {
  it('divides proven capacity by today’s median, marking a floor with ≥', () => {
    expect(headroomLabel({ value: 400, atLeast: true, help: '' }, 18.67)).toBe('≥ 21×');
    expect(headroomLabel({ value: 80, atLeast: false, help: '' }, 18.67)).toBe('4.3×');
  });

  it('places today on a 0–proven track and centers the multiple over the gap, clamping labels inside', () => {
    swr.result = { data: bench(400, true) };
    const { head } = render();
    // The server render assumes a 240 px column: today 12.5 of 400 sits at 7.5 px, so its label pins left.
    expect(head).toMatch(/data-span="today"[^>]*left:7.5px/);
    expect(head).toMatch(/data-span="gap"[^>]*left:7.5px/);
    expect(head).toMatch(/data-span="headroom"[^>]*left:123.75px;transform:translateX\(-50%\)/);
    expect(head).toMatch(/data-span-label="today"[^>]*style="left:0"/);
    expect(head).not.toContain('data-span="limit"');
    expect(place(120, 40, 240)).toEqual({ side: 'center', x: 120 });
    expect(place(3, 40, 240)).toEqual({ side: 'left', x: 0 });
    expect(place(238, 40, 240)).toEqual({ side: 'right', x: 240 });
  });

  it('hides the span without today’s median or a proven rate', () => {
    swr.result = { data: bench(400, true) };
    const snapshot = fixture();
    snapshot.ladder.observed.p50 = { ...snapshot.ladder.observed.p50, value: null, tag: 'not-measured' };
    expect(render({ benchUrl: BENCH }, snapshot).head).not.toContain('data-span');
    swr.result = { data: { current: none, da: none, history: [], latestAt: null, unknown: [] } };
    expect(render().head).not.toContain('data-span');
  });
});

describe('subsystems by workload', () => {
  const cards = (html: string) => html.split('<h3').slice(1).map((c) => `<h3${c}`);
  const titles = (html: string) => cards(html).map((c) => text(c.split('</h3>')[0]));
  const card = (html: string, title: string) => cards(html).find((c) => text(c.split('</h3>')[0]).startsWith(title))!;
  const withStorage = () => {
    const data = bench(400, true);
    data.current.mix = { mgas: 400, atTop: true, run: { ...run(400), storage: storage() } };
    return data;
  };

  it('orders cards by their category’s place in What breaks first, unranked ones last in the default order', () => {
    swr.result = { data: bench(400, true) };
    // DA ~57 first; the merged core row ties proof node, validators and sequencer; no storage leaves both disks unranked.
    expect(titles(render().subsystems).map((t) => t.split(' · ')[0])).toEqual(['DA', 'Proof node', 'Validators', 'Sequencer', 'Disk', 'Disk']);
    swr.result = { data: withStorage() };
    expect(titles(render().subsystems)).toEqual([
      'DA · not measured yet',
      'Disk · archive · 1-year runway',
      'Proof node · within budget (lag ≤ 10, ≤ 1 s)',
      'Validators · all keep up',
      'Sequencer · 400 delivered',
      'Disk · full node · 2-year runway',
    ]);
  });

  it('stacks one card per row below 760 px and labels columns with full names', () => {
    swr.result = { data: bench(400, true) };
    const html = render().subsystems;
    expect(html).toContain('grid grid-cols-1 gap-3 min-[760px]:grid-cols-2');
    expect(html).toContain('<abbr class="no-underline" title="Payments (B20)">Pay</abbr>');
    expect(html).toContain('title="Mainnet mix (bench run)"');
  });

  it('rescales DA blobs to the load rate and names workloads whose ceiling is under the gas limit', () => {
    // Payments: 20 blobs over a 160 Mgas/s window at a 200 Mgas/s load → 25, ceiling ~76. Swaps: ~232, above the 200 gas limit.
    swr.result = { data: bench(400, true, { da: { mix: null, payment: run(200, 'payment', daResult(8e7, 20, false)), swap: run(400, 'swap', daResult(2.6158e7, 22.4, false)) } }) };
    const da = card(render().subsystems, 'DA');
    expect(text(da.split('</h3>')[0])).toBe('DA · binding for payments');
    expect(da.split('</h3>')[0]).toContain('text-bds-red-60');
    expect(rows(da)).toEqual(['Blobs per L1 slot at each run’s rate 2556— (not in this run)', 'Ceiling (Mgas/s) 76232— (not in this run)']);
    swr.result = { data: bench(400, true, { da: { mix: null, payment: null, swap: run(400, 'swap', daResult(2.6158e7, 22.4, false)) } }) };
    expect(text(card(render().subsystems, 'DA').split('</h3>')[0])).toBe('DA · below target at the 200 Mgas/s gas limit');
  });

  it('projects disk per workload run, saying which runs lack a storage measurement', () => {
    const data = withStorage();
    data.current.payment = { mgas: 200, atTop: true, run: run(200, 'payment') };
    swr.result = { data };
    const html = render().subsystems;
    // (0.0086 bench + 0.0008 mainnet state) B/gas × 400 Mgas/s × 1 year; (0.0086 × 31 d + 0.0045 × 15 d) × 400 Mgas/s.
    expect(rows(card(html, 'Disk · archive'))).toEqual([
      'Growth at 400 — (needs a run with storage measurement)— (no proven run for this workload)≥ 118.7 TB/yr',
      'Ceiling (1-year runway) — (needs a run with storage measurement)— (no proven run for this workload)≤ 138',
    ]);
    expect(rows(card(html, 'Disk · full node'))[0]).toBe('Size at 400 — (needs a run with storage measurement)— (no proven run for this workload)11.5 TB');
    expect(html).toContain('title="needs a run with storage measurement"');
  });

  it('flags proof-node budgets and validators that fall behind', () => {
    const data = bench(400, true);
    const slow = run(400, 'mix', null, 11);
    slow.proofNode!.proofs!.methods.debug_executePayload.latency.p99Ms = 1200;
    slow.replay = { ...slow.replay!, blocksPerSecond: 4 };
    data.current.mix = { mgas: 400, atTop: true, run: slow };
    data.current.swap = { mgas: 400, atTop: true, run: run(400, 'swap') };
    swr.result = { data };
    const html = render().subsystems;
    expect(text(card(html, 'Proof node').split('</h3>')[0])).toBe('Proof node · lag over 10 for mix; executePayload over 1 s for mix');
    expect(rows(card(html, 'Proof node'))).toEqual([
      'Lag p99 (max) — (no proven run for this workload)4 (20)11 (20)',
      'executePayload p99 — (no proven run for this workload)733 ms1200 ms',
      'Witness p50 — (no proven run for this workload)— (not in this run)— (not in this run)',
    ]);
    expect(text(card(html, 'Validators').split('</h3>')[0])).toBe('Validators · mix does not keep up');
    expect(rows(card(html, 'Validators'))[0]).toBe('Replay speed — (no proven run for this workload)7.3×0.8×');
    expect(card(html, 'Validators').split('</h3>')[0]).toContain('text-bds-red-60');
  });

  it('shows delivered rate, successful tx/s with reverts over 1%, and block latency', () => {
    const data = bench(400, true);
    data.current.swap = { mgas: 400, atTop: true, run: { ...run(400, 'swap'), reverted: 0.155, blockLatency: { p50Ms: 205.4, p99Ms: 306.3 } } };
    data.current.payment = { mgas: 200, atTop: true, run: { ...run(200, 'payment'), reverted: 0.005 } };
    swr.result = { data };
    const seq = card(render().subsystems, 'Sequencer');
    expect(text(seq.split('</h3>')[0])).toBe('Sequencer · 200–400 delivered');
    // 4,200 submitted tx/s × (1 − 15.5% reverted) = 3,549.
    expect(rows(seq)).toEqual([
      'Delivered (Mgas/s) 195.02,090 tx/s395.03,549 tx/s16% reverted395.04,200 tx/s',
      'Block latency p50 / p99 — (not in this run)205 / 306 ms— (not in this run)',
    ]);
  });
});

describe('ladder', () => {
  it('shades the used band in two tones and labels today, p99, fee target, gas limit and proven', () => {
    swr.result = { data: bench(400, true) };
    const snapshot = fixture();
    snapshot.ladder.observed.p99 = { ...snapshot.ladder.observed.p99, value: 42.24, tag: 'measured' };
    const { ladder } = render({ benchUrl: BENCH }, snapshot);
    expect(ladder).toMatch(/data-band="p50" width="3.125%"/);
    expect(ladder).toMatch(/data-band="p99" width="10.56%"/);
    const label = (id: string) => text(ladder.split(`data-label="${id}"`)[1]?.split('data-label=')[0] ?? '').replace(/^[^>]*>/, '');
    expect(label('today')).toMatch(/^12\.5.*today/);
    expect(label('p99')).toMatch(/^42\.2.*p99/);
    expect(label('fee')).toMatch(/^40.*fee target/);
    expect(label('gas')).toMatch(/^200.*gas limit/);
    expect(label('proven')).toMatch(/^≥ 400.*proven/);
    expect(ladder).toMatch(/data-tick="gas" class="[^"]*border-dashed border-bds-orange-60/);
    expect(text(ladder)).toContain('up to medianmedian to p99allowed by policyproven, not yet allowed');
    expect(text(ladder)).not.toMatch(/42\.24|Usage data/);
  });

  it('ticks every ranked breaking point in its colour at its value, and none for unranked rows', () => {
    swr.result = { data: bench(400, true) };
    const { ladder } = render();
    // On the 960 px server-render width: DA payments ~57, swaps ~115, mix ~190 Mgas/s of 400.
    expect(ladder).toMatch(/data-tick="da-payment" class="[^"]*border-bds-red-60" style="left:137\.43\d*px/);
    expect(ladder).toMatch(/data-tick="da-swap" class="[^"]*border-bds-red-60" style="left:275\.94\d*px/);
    expect(ladder).toMatch(/data-tick="da-mix" class="[^"]*border-bds-red-60" style="left:455\.09\d*px/);
    // Without a storage run both disk rows are unranked, so neither gets a tick.
    expect(ladder).not.toMatch(/data-(tick|label)="disk-/);
  });

  it('pins a breaking point beyond the scale to the right edge without a tick', () => {
    const data = bench(400, true);
    data.current.mix = { mgas: 400, atTop: true, run: { ...run(400), storage: storage() } };
    swr.result = { data };
    const { ladder } = render();
    expect(ladder).toMatch(/data-tick="disk-archive" class="[^"]*border-bds-purple-60"/);
    expect(ladder).not.toContain('data-tick="disk-full"');
    expect(text(ladder.split('data-label="disk-full"')[1].split('data-label=')[0])).toMatch(/≤ 553 →.*full-node disk/);
  });

  it('keeps labels apart in a crowded set, dropping names to a legend before stacking tiers', () => {
    const point = (id: string, value: number): Point => ({ id, value, valueText: String(value), name: `limit ${id}`, tone: 'da', help: '' });
    const crowded = [10, 12, 14, 16, 18, 20, 22, 24, 26, 600].map((v, i) => point(`p${i}`, v));
    for (const width of [960, 600, 320]) {
      const placed = layoutPoints(crowded, 400, width);
      const top = (p: PlacedPoint) => (p.side === 'above' ? -1 : 1) * (p.tier + 1);
      for (const a of placed) {
        expect(a.left).toBeGreaterThanOrEqual(0);
        expect(a.left + a.width).toBeLessThanOrEqual(width + 0.001);
        for (const b of placed) {
          if (a !== b && top(a) === top(b)) expect(a.left + a.width <= b.left || b.left + b.width <= a.left).toBe(true);
        }
      }
      expect(placed.at(-1)).toMatchObject({ id: 'p9', offScale: true, x: width });
    }
    // Long names on a 320 px track: the third label fits beside the first only without its name.
    const long = (id: string, value: number): Point => ({ ...point(id, value), name: 'a breaking point with a long name' });
    expect(layoutPoints([long('a', 100), long('b', 180), long('c', 270)], 320, 320).map((p) => [p.side, p.tier, p.compact])).toEqual([
      ['above', 0, false],
      ['below', 0, false],
      ['above', 0, true],
    ]);
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
  it('ranks DA estimates first without bench data, with units, and leaves unproven limits unranked', () => {
    expect(rows(render({}).ranked)).toEqual([
      '1DA · Payments (B20)next~57 Mgas/s≈ 1,517 tx/sEstimatedEstimated until a bench run measures it. Target is 14, shared by all rollups.',
      '2DA · Swaps~115 Mgas/s≈ 799 tx/sEstimatedEstimated until a bench run measures it. Target is 14.',
      '3DA · Mix (bench)~190 Mgas/s≈ 981 tx/sEstimatedEstimated until a bench run measures it. Target is 14.',
      '—Execution (sequencer)—no proven run',
      '—Validators—pending',
      '—Proof node—pending',
      '—Disk · full node—needs a bench storage-growth run',
      '—Disk · archive node—needs a bench storage-growth run',
      '—TEE proving, RPC under sync—Not measured yet.',
    ]);
  });

  it('merges execution, validators and proof node when they share the proven ceiling, with the run in help', () => {
    swr.result = { data: bench(400, true) };
    const { ranked } = render();
    expect(rows(ranked)[3]).toBe('4Execution, validators, proof node≥ 400 Mgas/sMeasured in the bench: all passed at 400 Mgas/s, the highest rate tested.');
    expect(ranked).toContain('Run synthetic-400. Validator replay: 36.4 blocks/s, 7.3× the 5 needed. Proof node: lag p99 4 blocks, executePayload p99 733 ms.');
    expect(ranked.match(/>next</g)).toHaveLength(1);
    expect(ranked).toMatch(/border-dashed[^"]*" style="left:50%"/);
  });

  it('splits them when the proof node is over budget, leaving it unranked', () => {
    const over = bench(400, true);
    over.current.mix = { mgas: 400, atTop: true, run: run(400, 'mix', null, 11) };
    swr.result = { data: over };
    expect(rows(render().ranked).slice(3, 6)).toEqual([
      '4Execution (sequencer)≥ 400 Mgas/stop rate tested',
      '5Validators≥ 400 Mgas/s7.3× replay headroom',
      '—Proof node—over budget at 400 · lag p99 11 blocks',
    ]);
  });

  it('ranks the mix by the bench mix run’s DA everywhere on the page, with the bench evidence', () => {
    // 4.3e7 frame bytes over 4e10 gas put the 14-blob ceiling at ~141 Mgas/s; 16 blobs over a 160 Mgas/s window at 400 → 40.
    swr.result = { data: bench(400, true, { da: { mix: run(400, 'mix', daResult(4.3e7, 16, false)), payment: null, swap: null } }) };
    const { head, ladder, ranked, subsystems } = render();
    expect(rows(ranked)[2]).toMatch(/^3DA · Mix \(bench\)141 Mgas\/s≈ 3,528 tx\/sMeasuredMeasured in the bench: at 400 Mgas\/s, needs 40 blobs per L1 slot\. Target is 14\.$/);
    expect(text(ladder)).toMatch(/141.*DA · mix/);
    expect(tile(head, 'traffic mix')).toContain('capped by DA');
    expect(head).toContain('Its DA cap comes from the bench mix run, which is lighter per transaction and compresses worse than mainnet, so the cap is conservative.');
    expect(rows(subsystems.split('<h3')[1])[1]).toBe('Ceiling (Mgas/s) — (not in this run)— (not in this run)141');
  });

  it('says the next rate did not pass when the core limit is lowest below the top rate', () => {
    swr.result = { data: bench(40, false) };
    expect(rows(render().ranked)[0]).toBe('1Execution, validators, proof nodenext40 Mgas/sMeasured in the bench: all passed at 40 Mgas/s; the next rate tested did not pass.');
  });

  it('rescales a bench DA run’s posting-window blobs to its load rate, with the details in help', () => {
    // 20 blobs per slot over a window at 160 Mgas/s, rescaled to the 200 Mgas/s load: 25.
    swr.result = { data: bench(400, true, { da: { mix: null, payment: run(200, 'payment', daResult(8e7, 20, false)), swap: null } }) };
    const { ranked } = render();
    expect(rows(ranked)[0]).toBe('1DA · Payments (B20)next76 Mgas/s≈ 1,896 tx/sMeasuredMeasured in the bench: at 200 Mgas/s, needs 25 blobs per L1 slot. Target is 14, shared by all rollups.');
    expect(ranked).toContain('Run synthetic-200: 0.00200 compressed bytes per gas (compression 4.5×). Over the batch posting window it averaged 20.0 blobs per L1 slot at 160.0 Mgas/s; scaling that window to the 200 Mgas/s load gives 25.');
    expect(ranked).toContain('14 × 130,044 bytes per blob ÷ 12 s per slot ÷ bytes per gas.');
  });

  it('notes swaps reverts above 1% only', () => {
    const swapDa = (reverted: number) => ({ ...run(400, 'swap', daResult(2.6158e7, 22.4, false)), reverted });
    swr.result = { data: bench(400, true, { da: { mix: null, payment: null, swap: swapDa(0.155) } }) };
    expect(rows(render().ranked).find((r) => r.includes('DA · Swaps'))).toMatch(/needs 56 blobs per L1 slot\. Target is 14\. 16% of swaps reverted\.$/);
    swr.result = { data: bench(400, true, { da: { mix: null, payment: null, swap: swapDa(0.005) } }) };
    expect(rows(render().ranked).find((r) => r.includes('DA · Swaps'))).toMatch(/Target is 14\.$/);
  });

  it('ranks a measured swaps DA ceiling by its value, past the gas limit', () => {
    // 4e10 gas and 2.6158e7 frame bytes put the 14-blob ceiling at ~232 Mgas/s.
    swr.result = { data: bench(400, true, { da: { mix: null, payment: null, swap: run(400, 'swap', daResult(2.6158e7, 22.4, false)) } }) };
    const ranked = render().ranked;
    expect(rows(ranked).slice(0, 4).map((r) => r.slice(0, 22))).toEqual(['1DA · Payments (B20)ne', '2DA · Mix (bench)~190 ', '3DA · Swaps232 Mgas/s≈', '4Execution, validators']);
    const swapsRow = ranked.split('<tr').find((r) => r.includes('>DA · Swaps'))!;
    expect(swapsRow).toMatch(/style="width:58\.\d+%"/);
    expect(swapsRow).toMatch(/border-dashed[^"]*" style="left:50%"/);
  });

  it('lays out the proven run as a definition list, with the change only when there is one', () => {
    swr.result = { data: bench(400, true) };
    const block = text(render().ranked.split('<dl')[1]);
    expect(block).toMatch(/^[^>]*>Runsynthetic-400Rate400 → 395\.0 Mgas\/sCommitbbbbbbbDate2026-01-06Change↑ from 40 Mgas\/s on 2026-01-06 · compareSteps/);
    expect(render().ranked).toContain('href="https://github.com/base/base/compare/aaaa...bbbb"');
    swr.result = { data: bench(400, true, { history: [] }) };
    expect(text(render().ranked.split('<dl')[1])).not.toContain('Change');
  });
});

describe('disk ceilings', () => {
  const withStorage = (more: Partial<ProvenCapacity> = {}) => {
    const data = bench(400, true, more);
    data.current.mix = { mgas: 400, atTop: true, run: { ...run(400), storage: storage() } };
    return data;
  };
  const disk = (ranked: string, label: string) => rows(ranked).find((r) => r.includes(label))!;

  it('ranks both disk rows by their upper-bound ceilings, with plain-language evidence', () => {
    swr.result = { data: withStorage() };
    const { ranked } = render();
    expect(rows(ranked).map((r) => r.slice(0, 26))).toEqual([
      '1DA · Payments (B20)next~5',
      '2DA · Swaps~115 Mgas/s≈ 79',
      '3Disk · archive node≤ 138 ',
      '4DA · Mix (bench)~190 Mgas',
      '5Execution, validators, pr',
      '6Disk · full node≤ 553 Mga',
      '—TEE proving, RPC under sy',
    ]);
    // (45 TB − 4 TB) ÷ (1e6 × (0.0086 bench + 0.0008 mainnet state) B/gas × 1 year); (45 TB − 1.1 TB state) ÷ (1e6 × (history 31 d + proofs 15 d + 2 years of 0.0008 B/gas state)).
    expect(disk(ranked, 'archive node')).toBe('3Disk · archive node≤ 138 Mgas/sProjected from bench growth: one year fills the 45.0 TB disk (4.0 TB used today). Upper bound.');
    expect(disk(ranked, 'full node')).toBe('6Disk · full node≤ 553 Mgas/sProjected from bench growth: 31 days of history, 15 days of proofs and 2 years of state growth fit in 45.0 TB. Upper bound.');
  });

  it('pluralizes the runway', () => {
    swr.result = { data: withStorage() };
    const snapshot = fixture();
    snapshot.policy!.runwayYears = { fullNode: 1, archive: 2 };
    const { ranked } = render({ benchUrl: BENCH }, snapshot);
    expect(disk(ranked, 'archive node')).toContain('Projected from bench growth: 2 years fill the 45.0 TB disk');
    expect(disk(ranked, 'full node')).toContain('and one year of state growth fit in 45.0 TB');
  });

  it('lists every input and why the ceilings are upper bounds in help', () => {
    swr.result = { data: withStorage() };
    const help = render().ranked;
    expect(help).toContain("Inputs: 45.0 TB disk budget (a bench config assumption); today&#x27;s archive 4.0 TB from Synthetic archive snapshot on 2026-01-01 (invented size); 0.00860 bytes per gas from the mainnet mix run plus 0.0008 bytes per gas of mainnet state growth from Synthetic dashboard, since the bench run writes almost no new state; runway policy: full node 2 years, archive one year (Invented runway policy.).");
    expect(help).toContain("Inputs: 45.0 TB disk budget (a bench config assumption); today&#x27;s state 1.1 TB, measured at the mainnet mix run&#x27;s snapshot; 0.00860 bytes per gas of history and 0.00450 of proofs from the mainnet mix run; 0.0008 bytes per gas of production state growth from Synthetic dashboard;");
    expect(help).toContain('Upper bound: bench bytes per gas is a lower bound, because the sequencer prunes history.');
    expect(help).toContain("may write more bytes per gas than mainnet traffic does (Base&#x27;s whole archive is 4.0 TB)");
  });

  it('counts only the bench run’s state in the archive ceiling without production state growth', () => {
    swr.result = { data: withStorage() };
    const snapshot = fixture();
    delete snapshot.production!.stateBytesPerGas;
    // (45 TB − 4 TB) ÷ (1e6 × 0.0086 B/gas × 1 year).
    const { ranked } = render({ benchUrl: BENCH }, snapshot);
    expect(disk(ranked, 'archive node')).toMatch(/≤ 151 Mgas\/sProjected from bench growth/);
    expect(ranked).toContain('0.00860 bytes per gas from the mainnet mix run (bench state only)');
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
    const { ranked } = render({ benchUrl: BENCH }, snapshot);
    expect(rows(ranked)[0]).toBe('1Disk · archive nodenextover budgetProjected from bench growth: today\'s archive (50.0 TB) already fills the 45.0 TB disk.');
  });
});

describe('guardrails summary and work', () => {
  // The summary is off the first screen for now; the component stays for when it returns.
  const guardrails = (benchUrl?: string) => renderToStaticMarkup(<Guardrails guardrails={fixture().guardrails} collectedAt={fixture().collectedAt} benchUrl={benchUrl} />);

  it('compresses guardrails to breached, met and not-measured counts with a link', () => {
    const summary = guardrails();
    expect(text(summary)).toContain('Breached 1 — RPC availability 99.5 %Met 2Not measured 3');
    expect(text(summary)).toContain('RPC p99 latencyPropagation p99State growth');
    expect(summary).toContain('href="/scaling/guardrails"');
    swr.result = { data: bench(400, true) };
    expect(text(guardrails(BENCH))).toContain('Met 5');
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
