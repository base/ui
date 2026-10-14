import { describe, expect, it } from 'vitest';

import { parseSnapshot } from './snapshot.mjs';

// Synthetic data only: real snapshots are internal and never committed.
function fixture() {
  return {
    schemaVersion: 1,
    network: 'testnet',
    collectedAt: '2026-01-02T00:00:00Z',
    context: 'Synthetic fixture.',
    windows: { day: { label: '24 h', start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' } },
    headline: [{ label: 'Observed gas/s', status: 'observed', value: 12.5, unit: 'Mgas/s', window: 'day', note: 'n' }],
    sections: [
      {
        id: 'da',
        title: 'DA',
        summary: 's',
        metrics: [{ label: 'Confirmed drain', status: 'not-measured', value: null, unit: 'KB/s', window: null, note: 'n' }],
        gaps: ['Confirmed drain'],
      },
    ],
    work: [
      {
        title: 'w', status: 'Proposed', owner: null, hypothesis: 'h', change: 'c', impact: 'i', evidence: 'e',
        links: [{ label: 'Doc', url: 'https://example.com' }],
      },
    ],
  };
}

describe('parseSnapshot', () => {
  it('accepts a valid snapshot and keeps missing values null', () => {
    const result = parseSnapshot(fixture());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshot.sections[0].metrics[0].value).toBeNull();
  });

  it('rejects a zero standing in for an unmeasured value', () => {
    const data = fixture();
    (data.sections[0].metrics[0] as { value: number | null }).value = 0;
    expect(parseSnapshot(data)).toEqual({
      ok: false,
      errors: ['sections[0].metrics[0].value: must be null when not-measured'],
    });
  });

  it('rejects observations without a value or a known window', () => {
    const data = fixture();
    Object.assign(data.headline[0], { value: null, window: '7d' });
    expect(parseSnapshot(data)).toEqual({
      ok: false,
      errors: ['headline[0].value: required for observed', 'headline[0].window: expected a key of windows'],
    });
  });

  it('rejects windows that end before they start', () => {
    const data = fixture();
    data.windows.day.end = '2025-12-31T00:00:00Z';
    expect(parseSnapshot(data)).toEqual({ ok: false, errors: ['windows.day: start must precede end'] });
  });
});
