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
const run = (mgas: number): Run => ({ outputDir: `synthetic-${mgas}`, mgas, gps: (mgas - 5) * 1e6, passed: true, commit: 'bbbbbbbbbbbbbbbb', createdAt: T0 + 5 * DAY });
const bench = (mgas: number, atTop: boolean): Bench => ({
  current: { mgas, atTop, run: run(mgas) },
  history: [
    { at: T0, mgas: 40, commit: 'aaaaaaaaaaaaaaaa', previousCommit: null, compareUrl: null },
    { at: T0 + 5 * DAY, mgas, commit: 'bbbbbbbbbbbbbbbb', previousCommit: 'aaaaaaaaaaaaaaaa', compareUrl: 'https://github.com/base/base/compare/aaaa...bbbb' },
  ],
  unknown: [],
  now: T0 + 7 * DAY,
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
    for (const text of ['latest main run in the last 14 days was comparable and delivered ≥ 95% of target', 'Run synthetic-400, commit bbbbbbb, 2026-01-06.', '400 Mgas/s is the highest rate the bench runs', 'DA and proof guardrails are not checked']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('Qualified by synthetic-400: 400 Mgas/s run delivered 395.0 Mgas/s');
    expect(html).toContain('aria-label="Proven capacity over time"');
    expect(html).toContain('40 Mgas/s → 400 Mgas/s');
    expect(ceilingLabel(html)).toBe('DA');
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
    swr.result = { data: { current: null, history: [], unknown: [], now: T0 } };
    expect(render()).toContain('No main run passed in the last 14 days.');
    swr.result = { data: { current: null, history: [], unknown: ['r1', 'r2'], now: T0 } };
    expect(render()).toContain('2 run(s) could not be loaded');
    expect(render()).not.toContain('No main run passed');
  });

  it('links the dashboard only when set', () => {
    expect(render({ dashboardUrl: 'https://dashboards.example.com/scaling' })).toContain('href="https://dashboards.example.com/scaling">Mainnet load, gas limit, DA ceiling →</a>');
    expect(render()).not.toContain('Mainnet load');
  });
});
