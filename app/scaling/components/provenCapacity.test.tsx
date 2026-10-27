import { readFileSync } from 'node:fs';

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bench } from './ProvenCapacity';
import type { Run } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { Ladder } from './Ladder';

// Synthetic data only: real bench results and snapshots are internal and never committed.
const swr = vi.hoisted(() => ({ result: {} as object, key: undefined as unknown }));
vi.mock('swr', () => ({ default: (key: unknown) => ((swr.key = key), key === null ? {} : swr.result) }));
vi.mock('./Info', () => ({ Info: ({ children }: { children: ReactNode }) => <span className="help">{children}</span> }));

const BENCH = 'https://bench.example.com';
const DAY = 86_400_000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const STEPS: Run['steps'] = [
  { name: 'sequencer', enabled: true, status: 'passed' },
  { name: 'validator_replay', enabled: true, status: 'passed' },
  { name: 'tee_proof', enabled: false, status: 'not-implemented', reason: 'needs a synthetic L1' },
];
const run = (mgas: number, workload: Run['workload'] = 'mix', da: Run['da'] = null): Run => ({
  id: `synthetic-${workload}-${mgas}`, outputDir: `synthetic-${mgas}`, workload, mgas, gps: (mgas - 5) * 1e6, tps: mgas * 10.5, passed: true,
  commit: 'bbbbbbbbbbbbbbbb', createdAt: T0 + 5 * DAY, steps: STEPS, replay: null, proofNode: null, da,
});
const none = { mix: null, payment: null, swap: null };
const bench = (mgas: number, atTop: boolean, more: Partial<Bench> = {}): Bench => ({
  current: { ...none, mix: { mgas, atTop, run: run(mgas) } },
  da: none,
  history: [
    { at: T0, mgas: 40, commit: 'aaaaaaaaaaaaaaaa', previousCommit: null, compareUrl: null },
    { at: T0 + 5 * DAY, mgas, commit: 'bbbbbbbbbbbbbbbb', previousCommit: 'aaaaaaaaaaaaaaaa', compareUrl: 'https://github.com/base/base/compare/aaaa...bbbb' },
  ],
  unknown: [],
  now: T0 + 7 * DAY,
  ...more,
});
const snapshot: Snapshot = JSON.parse(readFileSync(new URL('../fixtures/synthetic.v2.json', import.meta.url), 'utf8'));
const render = (props: { benchUrl?: string; dashboardUrl?: string } = { benchUrl: BENCH }) =>
  renderToStaticMarkup(<Ladder ladder={snapshot.ladder} ceilings={snapshot.ceilings} translations={snapshot.translations} windows={snapshot.windows} {...props} />);
// A placed rung renders its label, help and value; an unplaced one is a list item with its tag.
const rung = (html: string, label: string) => html.match(new RegExp(`${label}(?:(?!</li>).)*?<span class="font-mono[^"]*">(.*?)</span></span>`))?.[1];
const ceilingLabel = (html: string) => html.match(/Ceiling · (\w+)/)?.[1];

beforeEach(() => {
  swr.result = {};
  swr.key = undefined;
});

describe('Ladder bench capacity', () => {
  it('keeps the snapshot rungs and fetches nothing without a URL', () => {
    const html = render({});
    expect(swr.key).toBeNull();
    expect(html).toMatch(/Qualified sustained<\/span>.*Not established/);
    expect(ceilingLabel(html)).toBe('DA');
    expect(html).not.toContain('bench results');
  });

  it('keeps the snapshot rungs while loading and after a failed fetch', () => {
    expect(render()).toContain('Loading bench results');
    expect(swr.key).toEqual(['scaling-proven-capacity', BENCH]);
    swr.result = { error: new TypeError('Failed to fetch'), data: bench(400, true) };
    const html = render();
    expect(html).toContain('VPN');
    expect(html).toMatch(/Qualified sustained<\/span>.*Not established/);
    expect(html).not.toContain('bench</span>');
  });

  it('shows ≥ at the top rate with bench provenance, the rule, run, commit, caveat, evidence and chart', () => {
    swr.result = { data: bench(400, true) };
    const html = render();
    expect(rung(html, 'Qualified sustained')).toMatch(/^≥ 400<span[^>]*>measured · bench$/);
    for (const text of ['latest main run in the last 14 days was comparable and delivered ≥ 95% of target', 'Run synthetic-400, commit bbbbbbb, 2026-01-06.', '400 Mgas/s is the highest rate the bench runs', 'Comparable requires every enabled pipeline step to pass']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('Qualified by <a class="underline" href="/scaling/runs/bench/synthetic-mix-400">synthetic-400</a>: 400 Mgas/s run delivered 395.0 Mgas/s');
    expect(html).toMatch(/bg-bds-green-50"><\/span>validator replay passed</);
    expect(html).toContain('title="needs a synthetic L1"');
    expect(html).toContain('aria-label="Proven capacity over time"');
    expect(html).toContain('40 Mgas/s → 400 Mgas/s');
    // The page passes #214's estimated DA ceiling, which never binds.
    expect(ceilingLabel(html)).toBe('execution');
  });

  it('drops ≥ below the top rate, and the bench execution ceiling binds when it is the lowest', () => {
    swr.result = { data: bench(80, false) };
    const html = render();
    expect(rung(html, 'Qualified sustained')).toMatch(/^80<span[^>]*>measured · bench$/);
    expect(ceilingLabel(html)).toBe('execution');
    expect(rung(html, 'Ceiling · execution')).toMatch(/^80<span[^>]*>measured · bench$/);
    expect(html).not.toContain('highest rate the bench runs');
  });

  it('shows an empty state when no run counts, and warns when run files failed to load', () => {
    swr.result = { data: { current: none, da: none, history: [], unknown: [], now: T0 } };
    expect(render()).toContain('No main run passed in the last 14 days.');
    swr.result = { data: { current: none, da: none, history: [], unknown: ['r1', 'r2'], now: T0 } };
    expect(render()).toContain('2 run(s) could not be loaded');
    expect(render()).not.toContain('No main run passed');
  });

  it('translates to bench payments/s and swaps/s, pending without a qualifying run, and the snapshot constants without bench data', () => {
    expect(render({})).toContain('1 Mgas/s ≈ 19 payments/s ≈ swaps/s pending');
    swr.result = { data: bench(400, true, { current: { mix: null, swap: null, payment: { mgas: 200, atTop: false, run: run(200, 'payment') } } }) };
    expect(render()).toContain('<a class="underline" href="/scaling/runs/bench/synthetic-payment-200">≥ 2,100 payments/s (B20 transfers)</a> · swaps/s (Uniswap v3) pending');
  });

  it('binds a measured DA ceiling once payments and swaps have bench DA runs', () => {
    const da = (frame_bytes: number): Run['da'] => ({
      result: { seconds: 600, gas_used: 4e10, transactions: 1e6, transaction_bytes: 0, frame_bytes, gas_per_second: 0, bytes_per_gas: 0, compression_ratio: 0, blobs_per_l1_slot: 15, blob_fill: 1, blob_target_gas_per_second: 0 },
      target: 14,
      withinTarget: false,
    });
    swr.result = { data: bench(400, true, { da: { mix: null, payment: run(200, 'payment', da(8e7)), swap: run(200, 'swap', da(4e7)) } }) };
    const html = render();
    expect(ceilingLabel(html)).toBe('DA');
    expect(rung(html, 'Ceiling · DA')).toMatch(/^76<span[^>]*>modeled$/);
  });

  it('links the dashboard only when set', () => {
    expect(render({ dashboardUrl: 'https://dashboards.example.com/scaling' })).toContain('href="https://dashboards.example.com/scaling">Mainnet load, gas limit, DA ceiling →</a>');
    expect(render()).not.toContain('Mainnet load');
  });
});
