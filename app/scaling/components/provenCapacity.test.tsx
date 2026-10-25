import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProvenCapacity as Capacity, Run } from '../proven/capacity';
import { ProvenCapacity } from './ProvenCapacity';

// Synthetic data only: real bench results are internal and never committed.
const swr = vi.hoisted(() => ({ result: {} as object, key: undefined as unknown }));
vi.mock('swr', () => ({ default: (key: unknown) => ((swr.key = key), key === null ? {} : swr.result) }));

const BENCH = 'https://bench.example.com';
const DAY = 86_400_000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const run: Run = { outputDir: 'synthetic-400', mgas: 400, gps: 395e6, passed: true, commit: 'bbbbbbbbbbbbbbbb', createdAt: T0 + 5 * DAY };
const capacity = (atTop: boolean): Capacity & { now: number } => ({
  current: { mgas: 400, atTop, run },
  history: [
    { at: T0, mgas: 200, commit: 'aaaaaaaaaaaaaaaa', previousCommit: null, compareUrl: null },
    { at: T0 + 5 * DAY, mgas: 400, commit: run.commit, previousCommit: 'aaaaaaaaaaaaaaaa', compareUrl: 'https://github.com/base/base/compare/aaaa...bbbb' },
  ],
  unknown: [],
  now: T0 + 7 * DAY,
});
const render = (props: { benchUrl?: string; dashboardUrl?: string } = { benchUrl: BENCH }) => renderToStaticMarkup(<ProvenCapacity {...props} />);

beforeEach(() => {
  swr.result = {};
  swr.key = undefined;
});

describe('ProvenCapacity', () => {
  it('says the bench is not configured and fetches nothing without a URL', () => {
    expect(render({})).toContain('Bench results not configured (SCALING_BENCH_BASE_URL)');
    expect(swr.key).toBeNull();
  });

  it('shows loading while the fetch is pending', () => {
    expect(render()).toContain('Loading bench results');
    expect(swr.key).toEqual(['scaling-proven-capacity', BENCH]);
  });

  it('explains VPN and CORS when the fetch fails', () => {
    swr.result = { error: new TypeError('Failed to fetch') };
    const html = render();
    expect(html).toContain('VPN');
    expect(html).toContain('CORS');
  });

  it('shows an empty state when no run counts', () => {
    swr.result = { data: { current: null, history: [], unknown: [], now: T0 } };
    expect(render()).toContain('No main run passed in the last 14 days.');
  });

  it('shows capacity with ≥ at the top rate, evidence, rule, chart and compare links', () => {
    swr.result = { data: capacity(true) };
    const html = render();
    expect(html).toContain('≥ 400');
    expect(html).toContain('400 Mgas/s run delivered 395.0 Mgas/s');
    expect(html).toContain('href="https://github.com/base/base/commit/bbbbbbbbbbbbbbbb">bbbbbbb</a> · 2026-01-06');
    expect(html).toContain('≥ 95% of target');
    expect(html).toContain('aria-label="Proven capacity over time"');
    expect(html).toContain('200 Mgas/s → 400 Mgas/s');
    expect(html.match(/>compare</g)).toHaveLength(1);
    expect(html).toContain('href="https://github.com/base/base/compare/aaaa...bbbb"');
  });

  it('drops ≥ when a higher rate failed', () => {
    swr.result = { data: capacity(false) };
    const html = render();
    expect(html).toContain('>400 <span');
    expect(html).not.toContain('≥ 400');
  });

  it('links the dashboard only when set', () => {
    expect(render({ dashboardUrl: 'https://dashboards.example.com/scaling' })).toContain('href="https://dashboards.example.com/scaling">Mainnet load, gas limit, DA ceiling →</a>');
    expect(render()).not.toContain('Mainnet load');
  });
});
