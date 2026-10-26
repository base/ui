import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Snapshot } from '../snapshot.mjs';
import { CeilingCards } from './CeilingCards';
import { Guardrails } from './Guardrails';
import { Progress } from './Progress';

// Synthetic data only: real snapshots are internal and never committed.
function fixture(): Snapshot {
  return JSON.parse(readFileSync(new URL('../fixtures/synthetic.v2.json', import.meta.url), 'utf8'));
}

const cards = (html: string) => html.split('<a ').slice(1);

describe('CeilingCards', () => {
  it('renders every area but networking in a fixed order with its tag, and badges the binding card', () => {
    const html = cards(renderToStaticMarkup(<CeilingCards ceilings={fixture().ceilings.reverse()} />));
    expect(html.map((c) => c.match(/href="\/scaling\/(\w+)"/)![1])).toEqual(['da', 'execution', 'state']);
    expect(html.map((c) => c.match(/border-dashed[^>]*>([^<]+)</)![1])).toEqual(['Modeled', 'Estimated', 'Not modeled']);
    expect(html.map((c) => c.includes('>Binding<'))).toEqual([true, false, false]);
  });

  it('moves the binding badge to a lower measured ceiling, and shows a dash, reason and pending inputs when there is no value', () => {
    const { ceilings } = fixture();
    ceilings[1] = { ...ceilings[1], value: 90, tag: 'measured' };
    const html = cards(renderToStaticMarkup(<CeilingCards ceilings={ceilings} />));
    expect(html.map((c) => c.includes('>Binding<'))).toEqual([false, true, false]);
    expect(html[2]).toContain('>—<');
    expect(html[2]).toContain('live-state growth not measured');
    expect(html[2]).toContain('state_bytes_per_gas · pending</li>');
    expect(html[2]).toContain('runway_years · 4 years · provisional · 2026-01-01</li>');
  });
});

describe('Guardrails', () => {
  it('shows comparator and unit with the threshold, tags provisional and unset thresholds, and colors only known statuses', () => {
    const rows = renderToStaticMarkup(<Guardrails guardrails={fixture().guardrails} />).split('<tr').slice(2);
    expect(rows[0]).toContain('≤ 80 %');
    expect(rows[0]).toContain('bg-bds-green-50');
    expect(rows[1]).toContain('≥ 99.9 %');
    expect(rows[1]).toContain('bg-bds-red-50');
    expect(rows[2]).toContain('>Provisional<');
    expect(rows[2]).toContain('Synthetic owner');
    expect(rows[3]).toContain('>Unset<');
    expect(rows[3]).toContain('bg-bds-gray-30');
    expect(rows[3]).not.toMatch(/bg-bds-(green|red)/);
  });

  it('sorts rows with a value first, then unknown, then muted not-monitored rows', () => {
    const html = renderToStaticMarkup(<Guardrails guardrails={fixture().guardrails.reverse()} />);
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
