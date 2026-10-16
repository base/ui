import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Snapshot } from '../snapshot.mjs';
import { CeilingCards } from './CeilingCards';
import { Guardrails } from './Guardrails';

// Synthetic data only: real snapshots are internal and never committed.
function fixture(): Snapshot {
  return JSON.parse(readFileSync(new URL('../fixtures/synthetic.v2.json', import.meta.url), 'utf8'));
}

const cards = (html: string) => html.split('<a ').slice(1);

describe('CeilingCards', () => {
  it('renders every area in a fixed order with its tag, and badges the binding card', () => {
    const html = cards(renderToStaticMarkup(<CeilingCards ceilings={fixture().ceilings.reverse()} />));
    expect(html.map((c) => c.match(/href="\/scaling\/(\w+)"/)![1])).toEqual(['da', 'execution', 'state', 'networking']);
    expect(html.map((c) => c.match(/border-dashed[^>]*>([^<]+)</)![1])).toEqual(['Modeled', 'Estimated', 'Not modeled', 'Not modeled']);
    expect(html.map((c) => c.includes('>Binding<'))).toEqual([true, false, false, false]);
  });

  it('moves the binding badge to a lower measured ceiling, and shows a dash, reason and pending inputs when there is no value', () => {
    const { ceilings } = fixture();
    ceilings[1] = { ...ceilings[1], value: 90, tag: 'measured' };
    const html = cards(renderToStaticMarkup(<CeilingCards ceilings={ceilings} />));
    expect(html.map((c) => c.includes('>Binding<'))).toEqual([false, true, false, false]);
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
});
