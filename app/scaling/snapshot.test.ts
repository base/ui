import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { deriveBinding, parseSnapshot } from './snapshot.mjs';

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

  it('rejects measured or modeled entries without a value', () => {
    const data = fixture();
    data.ceilings[0].value = null;
    data.ladder.observed.p50.value = null;
    expect(errorsOf(data)).toEqual(['ladder.observed.p50.value: required for measured', 'ceilings[0].value: required for modeled']);
  });

  it('rejects unknown areas and tags', () => {
    const data = fixture();
    data.ceilings[1].area = 'l1';
    data.ladder.operatingPoint.tag = 'guessed';
    data.work[0].area = 'ops';
    expect(errorsOf(data)).toEqual([
      'ladder.operatingPoint.tag: expected one of measured, modeled, estimated, not-measured, not-modeled, not-established',
      'ceilings[1].area: expected one of da, execution, state, networking',
      'snapshot.ceilings: missing execution',
      'work[0].area: expected one of da, execution, state, networking',
    ]);
  });

  it('rejects a missing ceiling area and a duplicate guardrail id', () => {
    const data = fixture();
    data.ceilings.pop();
    data.guardrails[1].id = data.guardrails[0].id;
    expect(errorsOf(data)).toEqual(['snapshot.ceilings: missing networking', 'guardrails[1].id: duplicate']);
  });

  it('rejects a section id without a page', () => {
    const data = fixture();
    data.sections[1].id = 'networking';
    expect(errorsOf(data)).toEqual(['sections[1].id: expected one of da, execution, state, outcomes']);
  });

  it('rejects a guardrail status that disagrees with its value and threshold', () => {
    const data = fixture();
    data.guardrails[0].status = 'breached';
    data.guardrails[1].status = 'unknown';
    data.guardrails[3].status = 'ok';
    expect(errorsOf(data)).toEqual([
      'guardrails[0].status: expected ok for 42 <= 80',
      'guardrails[1].status: expected breached for 99.5 >= 99.9',
      'guardrails[3].status: must be unknown without a value and threshold',
    ]);
  });

  it('accepts a not-monitored guardrail with or without a threshold, but never with a value', () => {
    const data = fixture();
    data.guardrails[5] = { ...data.guardrails[5], status: 'not-monitored' };
    expect(errorsOf(data)).toEqual([]);
    data.guardrails[4].value = 900;
    data.guardrails[1].status = 'not-monitored';
    expect(errorsOf(data)).toEqual([
      'guardrails[1].value: must be null when not-monitored',
      'guardrails[4].value: must be null when not-monitored',
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

  it('accepts a qualified rung only with links to the run pages behind it', () => {
    const data = fixture();
    Object.assign(data.ladder.qualified, { value: 30, tag: 'measured' });
    expect(errorsOf(data)).toEqual(['ladder.qualified.evidence: a qualified value needs links to the run pages behind it']);
    data.ladder.qualified.evidence = [{ label: 'Synthetic doc', url: 'https://example.com/synthetic/doc' }];
    expect(errorsOf(data)).toEqual(['ladder.qualified.evidence: a qualified value needs links to the run pages behind it']);
    data.ladder.qualified.evidence = [{ label: 'Synthetic run', url: 'https://example.com/scaling/runs/bench/synthetic-1/not-a-page' }];
    expect(errorsOf(data)).toEqual(['ladder.qualified.evidence: a qualified value needs links to the run pages behind it']);
    data.ladder.qualified.evidence = [{ label: 'Synthetic run', url: 'https://example.com/scaling/runs/bench/synthetic-1' }];
    expect(errorsOf(data)).toEqual([]);
  });
});

describe('deriveBinding', () => {
  it('picks the lowest measured or modeled ceiling and ignores estimates', () => {
    const { ceilings } = fixture();
    ceilings[1].value = 60;
    expect(deriveBinding(ceilings)?.area).toBe('da');
    ceilings[1].tag = 'measured';
    expect(deriveBinding(ceilings)?.area).toBe('execution');
  });

  it('returns null when no ceiling is measured or modeled', () => {
    const { ceilings } = fixture();
    Object.assign(ceilings[0], { value: null, tag: 'not-modeled' });
    ceilings[1].tag = 'estimated';
    expect(deriveBinding(ceilings)).toBeNull();
  });
});
