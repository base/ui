import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isStale, parseSnapshot } from './snapshot.mjs';

// Synthetic data only: real snapshots are internal and never committed.
function fixture() {
  return JSON.parse(readFileSync(new URL('./fixtures/synthetic.v2.json', import.meta.url), 'utf8'));
}

function errorsOf(data: unknown) {
  const result = parseSnapshot(data);
  return result.ok ? [] : result.errors;
}

describe('parseSnapshot', () => {
  it('accepts the synthetic fixture and keeps missing values null', () => {
    const result = parseSnapshot(fixture());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.ladder.observed.p99.value).toBeNull();
    expect(result.snapshot.translations.gasPerSwap).toBeNull();
    expect(result.snapshot.work[1].linear).toBeNull();
  });

  it('rejects schema version 1 and names the migration', () => {
    const errors = errorsOf({ ...fixture(), schemaVersion: 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^schemaVersion: 1 is no longer read; migrate to 2: replace headline with ladder/);
  });

  it('rejects a zero standing in for an unmeasured value', () => {
    const data = fixture();
    data.ladder.qualified.value = 0;
    data.sections[0].metrics[1].value = 0;
    expect(errorsOf(data)).toEqual([
      'ladder.qualified.value: must be null when not-established',
      'sections[0].metrics[1].value: must be null when not-measured',
    ]);
  });

  it('rejects measured entries without a value', () => {
    const data = fixture();
    data.ladder.observed.p50.value = null;
    expect(errorsOf(data)).toEqual(['ladder.observed.p50.value: required for measured']);
  });

  it('rejects unknown areas and tags', () => {
    const data = fixture();
    data.ladder.operatingPoint.tag = 'guessed';
    data.work[0].area = 'ops';
    expect(errorsOf(data)).toEqual([
      'ladder.operatingPoint.tag: expected one of measured, modeled, estimated, not-measured, not-modeled, not-established',
      'work[0].area: expected one of da, execution, state, networking',
    ]);
  });

  it('rejects a realized effect without evidence', () => {
    const data = fixture();
    data.work[0].evidence = null;
    expect(errorsOf(data)).toEqual(['work[0].evidence: required when realized is set']);
  });

  it('rejects Linear progress outside [0, 1]', () => {
    const data = fixture();
    data.work[0].linear.progress = 1.5;
    expect(errorsOf(data)).toEqual(['work[0].linear.progress: expected a number in [0, 1]']);
  });

  it('rejects windows that end before they start', () => {
    const data = fixture();
    data.windows.day.end = '2025-12-31T00:00:00Z';
    expect(errorsOf(data)).toEqual(['windows.day: start must precede end']);
  });
});

describe('isStale', () => {
  const collectedAt = fixture().collectedAt;

  it('flags snapshots older than the threshold', () => {
    expect(isStale(collectedAt, new Date('2026-01-13T00:00:00Z'))).toBe(true);
    expect(isStale(collectedAt, new Date('2026-01-11T00:00:00Z'))).toBe(false);
    expect(isStale(collectedAt, new Date('2026-01-13T00:00:00Z'), 20)).toBe(false);
  });
});
