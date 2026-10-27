import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Run } from '../proven/capacity';
import type { Snapshot } from '../snapshot.mjs';
import { AREAS } from './CeilingCards';
import { RunBackedCeilingCard } from './RunBackedCeilingCard';
import { Guardrails, scorecardGuardrails } from './Guardrails';
import { Progress } from './Progress';

// Synthetic data only: real snapshots are internal and never committed.
function fixture(): Snapshot {
  return JSON.parse(readFileSync(new URL('../fixtures/synthetic.v2.json', import.meta.url), 'utf8'));
}

const cards = (html: string) => html.split('<a ').slice(1);

describe('CeilingCard', () => {
  it('renders every area but networking in a fixed order with its tag, and badges the binding card', () => {
    const html = cards(renderToStaticMarkup(<>{AREAS.map(([area]) => <RunBackedCeilingCard key={area} area={area} ceilings={fixture().ceilings.reverse()} />)}</>));
    expect(html.map((c) => c.match(/href="\/scaling\/(\w+)"/)![1])).toEqual(['da', 'execution', 'state']);
    expect(html.map((c) => c.match(/border-dashed[^>]*>([^<]+)</)![1])).toEqual(['Modeled', 'Estimated', 'Not modeled']);
    expect(html.map((c) => c.includes('>Binding<'))).toEqual([true, false, false]);
  });

  it('moves the binding badge to a lower measured ceiling, and shows a dash, reason and pending inputs when there is no value', () => {
    const { ceilings } = fixture();
    ceilings[1] = { ...ceilings[1], value: 90, tag: 'measured' };
    const html = cards(renderToStaticMarkup(<>{AREAS.map(([area]) => <RunBackedCeilingCard key={area} area={area} ceilings={ceilings} />)}</>));
    expect(html.map((c) => c.includes('>Binding<'))).toEqual([false, true, false]);
    expect(html[2]).toContain('>—<');
    expect(html[2]).toContain('live-state growth not measured');
    expect(html[2]).toContain('state_bytes_per_gas · pending</li>');
    expect(html[2]).toContain('runway_years · 4 years · provisional · 2026-01-01</li>');
  });
});

describe('Guardrails', () => {
  it('shows comparator and unit with the threshold, tags provisional and unset thresholds, and colors only known statuses', () => {
    const rows = renderToStaticMarkup(<Guardrails guardrails={fixture().guardrails} collectedAt={fixture().collectedAt} />).split('<tr').slice(2);
    expect(rows[0]).toContain('≤ 80 %');
    expect(rows[0]).toContain('bg-bds-green-50');
    expect(rows[1]).toContain('≥ 99.9 %');
    expect(rows[1]).toContain('bg-bds-red-50');
    expect(rows[2]).toContain('≤ 3 blocks');
    expect(rows[2]).not.toContain('>Provisional<');
    expect(rows[2]).toContain('Synthetic owner');
    expect(rows[2]).toContain('bg-bds-green-50');
    expect(rows[3]).toContain('>Unset<');
    expect(rows[3]).toContain('bg-bds-gray-30');
    expect(rows[3]).not.toMatch(/bg-bds-(green|red)/);
  });

  it('sorts rows with a value first, then unknown, then muted not-monitored rows', () => {
    const html = renderToStaticMarkup(<Guardrails guardrails={fixture().guardrails.reverse()} collectedAt={fixture().collectedAt} />);
    expect(html).toContain('Usage data as of 2026-01-02; bench rows show their run.');
    const rows = html.split('<tr').slice(2);
    expect(rows.map((r) => r.match(/<td[^>]*>(?:<span[^>]*>)?([^<]+?) ?</)![1])).toEqual([
      'RPC p99 latency', 'Validator keep-up', 'RPC availability', 'DA utilization', 'State growth', 'Propagation p99',
    ]);
    expect(rows[4]).toContain('>Unknown</span>');
    expect(rows[5]).toContain('text-bds-gray-60');
    expect(rows[5]).toContain('Not monitored');
    expect(rows.slice(0, 5).join('')).not.toContain('Not monitored');
  });
});

describe('scorecardGuardrails', () => {
  const LATENCY = { p50Ms: 2, p99Ms: 9, maxMs: 12 };
  const run = (blocksPerSecond: number, lagP99 = 4, executeP99 = 9): Run => ({
    id: 'synthetic', outputDir: 'synthetic-400', workload: 'mix', mgas: 400, gps: 4e8, tps: 6000, passed: true, commit: 'c0ffee',
    createdAt: Date.parse('2026-01-05T00:00:00Z'), steps: [], da: null,
    replay: { blocksPerSecond, newPayload: LATENCY, match: true },
    proofNode: {
      blocksPerSecond: 20, newPayload: LATENCY, match: true,
      proofs: { headLagBlocks: { samples: 10, p50: 1, p99: lagP99, max: 20 }, failedProbes: 0, methods: { debug_executePayload: { errors: 0, latency: { ...LATENCY, p99Ms: executeP99 } } }, witnessBytes: { samples: 0, p50: 0, p99: 0, max: 0 } },
    },
  });
  const byId = (rows: ReturnType<typeof scorecardGuardrails>) => Object.fromEntries(rows.map((g) => [g.id, g]));

  it('judges validator keep-up against 3 blocks, unknown without a snapshot value', () => {
    const guardrails = fixture().guardrails;
    expect(byId(scorecardGuardrails(guardrails, undefined))['validator-keep-up']).toMatchObject({ value: 3, threshold: 3, thresholdTag: 'set', status: 'ok' });
    const breached = guardrails.map((g) => (g.id === 'validator-keep-up' ? { ...g, value: 4 } : g));
    expect(byId(scorecardGuardrails(breached, undefined))['validator-keep-up'].status).toBe('breached');
    const rows = scorecardGuardrails(guardrails.filter((g) => g.id !== 'validator-keep-up'), undefined);
    expect(rows.at(-1)).toMatchObject({ id: 'validator-keep-up', value: null, threshold: 3, status: 'unknown' });
  });

  it('adds bench rows only with a bench host: proof-node lag ≤ 10 blocks, executePayload ≤ 1000 ms, replay headroom against 5 blocks/s', () => {
    expect(scorecardGuardrails(fixture().guardrails, undefined)).toHaveLength(6);
    const rows = byId(scorecardGuardrails(fixture().guardrails, run(36.4)));
    expect(rows['proof-node-head-lag']).toMatchObject({ value: 4, unit: 'blocks', threshold: 10, comparator: '<=', thresholdTag: 'set', status: 'ok', asOf: '2026-01-05T00:00:00.000Z' });
    expect(rows['proof-node-head-lag'].help).toContain('From bench run synthetic-400.');
    expect(rows['proof-node-execute-payload']).toMatchObject({ value: 9, unit: 'ms', threshold: 1000, thresholdTag: 'set', status: 'ok' });
    const over = byId(scorecardGuardrails(fixture().guardrails, run(36.4, 11, 1001)));
    expect(over['proof-node-head-lag'].status).toBe('breached');
    expect(over['proof-node-execute-payload'].status).toBe('breached');
    expect(rows['validator-replay-headroom']).toMatchObject({ value: 36.4, threshold: 5, comparator: '>=', status: 'ok' });
    expect(byId(scorecardGuardrails(fixture().guardrails, run(4)))['validator-replay-headroom'].status).toBe('breached');
  });

  it('shows bench rows as unknown when no qualifying run is loaded', () => {
    const rows = scorecardGuardrails(fixture().guardrails, null).slice(-3);
    expect(rows.map((g) => [g.value, g.status])).toEqual([[null, 'unknown'], [null, 'unknown'], [null, 'unknown']]);
    expect(rows[0].help).toContain('No qualifying mainnet-mix bench run is loaded.');
  });
});

describe('Progress', () => {
  it('shows Linear state and a labelled bar when linked, and proposed with no bar otherwise', () => {
    const [linked, proposed] = renderToStaticMarkup(<Progress work={fixture().work} />).split('px-4 py-3').slice(1);
    expect(linked).toContain('>started<');
    expect(linked).toContain('aria-label="4 of 10 issues done"');
    expect(linked).toContain('width:40%');
    expect(linked).toContain('Realized:');
    expect(linked).toContain('href="https://example.com/synthetic/linear/project"');
    expect(proposed).toContain('>proposed<');
    expect(proposed).not.toContain('progressbar');
    expect(proposed).not.toContain('Realized:');
  });

  it('hides realized without evidence', () => {
    const [item] = fixture().work;
    expect(renderToStaticMarkup(<Progress work={[{ ...item, evidence: null }]} />)).not.toContain('Realized:');
  });
});
