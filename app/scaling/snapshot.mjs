// Scaling scorecard snapshot format. Authored as .mjs (like deploy.config.mjs)
// so both the app and plain-node scripts can import it.
//
// A snapshot is a reviewed, dated set of observations, not live data. Real
// snapshots hold internal measurements, so they stay outside this public repo.
// app/scaling/fixtures/synthetic.v2.json is an invented example of every field.

/**
 * @typedef {'observed' | 'partial' | 'unavailable' | 'not-measured'} MetricStatus
 * @typedef {'measured' | 'modeled' | 'estimated' | 'not-measured' | 'not-modeled' | 'not-established'} Tag
 * @typedef {'da' | 'execution' | 'state' | 'networking'} Area
 * @typedef {{ label: string, url: string }} Link
 * @typedef {{ label: string, start: string, end: string }} Window
 * @typedef {{
 *   label: string, status: MetricStatus, value: number | null, unit: string,
 *   window: string | null, note: string, query?: string, source?: Link
 * }} Metric
 * @typedef {{ id: Area | 'outcomes', title: string, summary: string, metrics: Metric[], gaps: string[] }} Section
 * @typedef {{ value: number | null, unit: 'Mgas/s', tag: Tag, window: string | null, source?: Link, evidence?: Link[], help: string }} Rung
 * @typedef {{ observed: { p50: Rung, p99: Rung }, operatingPoint: Rung, configuredLimit: Rung, qualified: Rung }} Ladder
 * @typedef {{
 *   name: string, value: number | string | null, unit: string, asOf: string | null, source?: Link,
 *   status: 'observed' | 'configured' | 'provisional' | 'pending'
 * }} CeilingInput
 * @typedef {{
 *   area: Area, value: number | null, unit: 'Mgas/s', tag: Tag, formula: string,
 *   inputs: CeilingInput[], reason?: string, help: string
 * }} Ceiling
 * @typedef {{
 *   id: string, label: string, value: number | null, unit: string, threshold: number | null,
 *   comparator: '<=' | '>=', thresholdTag: 'set' | 'provisional' | 'unset', owner: string | null,
 *   asOf: string | null, status: 'ok' | 'breached' | 'unknown', help: string
 * }} Guardrail
 * @typedef {{ value: number, unit: 'gas', derivation: string, window: string | null }} Constant
 * @typedef {{
 *   projectId: string, issueId?: string, state: string, progress: number, scopeDone: number,
 *   scopeTotal: number, targetDate?: string, updatedAt: string, url: string
 * }} LinearStatus
 * @typedef {{
 *   area: Area, title: string, status: string, owner: string | null, hypothesis: string, change: string,
 *   expected: string | null, realized: string | null, evidence: Link | null, linear: LinearStatus | null,
 *   links: Link[]
 * }} WorkItem
 * @typedef {{
 *   schemaVersion: 2, network: string, collectedAt: string, context: string, windows: Record<string, Window>,
 *   ladder: Ladder, ceilings: Ceiling[], guardrails: Guardrail[],
 *   translations: { gasPerPayment: Constant | null, gasPerSwap: Constant | null },
 *   sections: Section[], work: WorkItem[]
 * }} Snapshot
 */

const STATUSES = ['observed', 'partial', 'unavailable', 'not-measured'];
const TAGS = ['measured', 'modeled', 'estimated', 'not-measured', 'not-modeled', 'not-established'];
const VALUED_TAGS = ['measured', 'modeled', 'estimated'];
const AREAS = ['da', 'execution', 'state', 'networking'];
// Each section renders on its area page, or on the guardrails page for outcomes.
const SECTION_IDS = [...AREAS, 'outcomes'];
const INPUT_STATUSES = ['observed', 'configured', 'provisional', 'pending'];
const DAY_MS = 86_400_000;
// Captures a bench run id, or a load test's network and timestamp.
export const RUN_PAGE = /^https:\/\/[^/]+\/scaling\/runs\/(?:bench\/([^/?#]+)|load\/([^/?#]+)\/([^/?#]+))\/?(?:[?#].*)?$/;
const V1_MESSAGE =
  'schemaVersion: 1 is no longer read; migrate to 2: replace headline with ladder, add ceilings, guardrails and ' +
  'translations, and give each work entry area, expected, realized, evidence and linear';

/**
 * Missing values must be explicit nulls with a non-measured status or tag,
 * never zeros, so the page shows them as unknown.
 * @param {unknown} data
 * @returns {{ ok: true, snapshot: Snapshot } | { ok: false, errors: string[] }}
 */
export function parseSnapshot(data) {
  const errors = [];
  const fail = (path, msg) => errors.push(`${path}: ${msg}`);
  const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const str = (o, key, path) => {
    if (typeof o[key] !== 'string' || o[key] === '') fail(`${path}.${key}`, 'expected non-empty string');
  };
  const nullableStr = (o, key, path) => {
    if (o[key] !== null && typeof o[key] !== 'string') fail(`${path}.${key}`, 'expected string or null');
  };
  const date = (o, key, path) => {
    if (typeof o[key] !== 'string' || Number.isNaN(Date.parse(o[key]))) fail(`${path}.${key}`, 'expected ISO timestamp');
  };
  const nullableDate = (o, key, path) => o[key] !== null && date(o, key, path);
  const oneOf = (o, key, path, values) => {
    if (!values.includes(o[key])) fail(`${path}.${key}`, `expected one of ${values.join(', ')}`);
  };
  const obj = (o, key, path) => {
    if (isObj(o[key])) return o[key];
    fail(`${path}.${key}`, 'expected object');
    return {};
  };
  const list = (o, key, path) => {
    if (Array.isArray(o[key])) return o[key];
    fail(`${path}.${key}`, 'expected array');
    return [];
  };
  const link = (l, path) => {
    if (!isObj(l)) return fail(path, 'expected { label, url }');
    str(l, 'label', path);
    if (typeof l.url !== 'string' || !l.url.startsWith('https://')) fail(`${path}.url`, 'expected https URL');
  };
  const windowRef = (o, key, path) => {
    if (o[key] !== null && !Object.hasOwn(windows, o[key])) fail(`${path}.${key}`, 'expected a key of windows');
  };
  const tagged = (o, path) => {
    if (o.unit !== 'Mgas/s') fail(`${path}.unit`, 'expected Mgas/s');
    if (!TAGS.includes(o.tag)) fail(`${path}.tag`, `expected one of ${TAGS.join(', ')}`);
    else if (VALUED_TAGS.includes(o.tag)) {
      if (!Number.isFinite(o.value)) fail(`${path}.value`, `required for ${o.tag}`);
    } else if (o.value !== null) fail(`${path}.value`, `must be null when ${o.tag}`);
  };

  if (!isObj(data)) return { ok: false, errors: ['snapshot: expected object'] };
  if (data.schemaVersion === 1) return { ok: false, errors: [V1_MESSAGE] };
  if (data.schemaVersion !== 2) fail('schemaVersion', 'expected 2');
  str(data, 'network', 'snapshot');
  date(data, 'collectedAt', 'snapshot');
  str(data, 'context', 'snapshot');

  const windows = obj(data, 'windows', 'snapshot');
  for (const [id, w] of Object.entries(windows)) {
    if (!isObj(w)) { fail(`windows.${id}`, 'expected object'); continue; }
    str(w, 'label', `windows.${id}`);
    date(w, 'start', `windows.${id}`);
    date(w, 'end', `windows.${id}`);
    if (Date.parse(w.start) >= Date.parse(w.end)) fail(`windows.${id}`, 'start must precede end');
  }

  const rung = (r, path) => {
    if (!isObj(r)) return fail(path, 'expected object');
    tagged(r, path);
    windowRef(r, 'window', path);
    str(r, 'help', path);
    if (r.source !== undefined) link(r.source, `${path}.source`);
  };
  const ladder = obj(data, 'ladder', 'snapshot');
  const observed = obj(ladder, 'observed', 'ladder');
  rung(observed.p50, 'ladder.observed.p50');
  rung(observed.p99, 'ladder.observed.p99');
  for (const key of ['operatingPoint', 'configuredLimit', 'qualified']) rung(ladder[key], `ladder.${key}`);
  const qualified = ladder.qualified;
  if (isObj(qualified) && (VALUED_TAGS.includes(qualified.tag) || qualified.evidence !== undefined)) {
    const evidence = Array.isArray(qualified.evidence) ? qualified.evidence : [];
    evidence.forEach((l, i) => link(l, `ladder.qualified.evidence[${i}]`));
    if (!evidence.length || !evidence.every((l) => RUN_PAGE.test(l?.url))) fail('ladder.qualified.evidence', 'a qualified value needs links to the run pages behind it');
  }

  const areas = new Set();
  list(data, 'ceilings', 'snapshot').forEach((c, i) => {
    const path = `ceilings[${i}]`;
    if (!isObj(c)) return fail(path, 'expected object');
    oneOf(c, 'area', path, AREAS);
    if (areas.has(c.area)) fail(`${path}.area`, 'duplicate');
    areas.add(c.area);
    tagged(c, path);
    str(c, 'formula', path);
    str(c, 'help', path);
    if (c.reason !== undefined) str(c, 'reason', path);
    list(c, 'inputs', path).forEach((input, j) => {
      const p = `${path}.inputs[${j}]`;
      if (!isObj(input)) return fail(p, 'expected object');
      str(input, 'name', p);
      if (typeof input.unit !== 'string') fail(`${p}.unit`, 'expected string');
      oneOf(input, 'status', p, INPUT_STATUSES);
      if ((input.value === null) !== (input.status === 'pending')) fail(`${p}.value`, 'null exactly when status is pending');
      else if (input.value !== null && !['number', 'string'].includes(typeof input.value)) fail(`${p}.value`, 'expected number or string');
      nullableDate(input, 'asOf', p);
      if (input.source !== undefined) link(input.source, `${p}.source`);
    });
  });
  // The page shows the DA ceiling from da/workloads.ts instead of this one; the entry is still required.
  for (const area of AREAS) if (!areas.has(area)) fail('snapshot.ceilings', `missing ${area}`);

  const guardrailIds = new Set();
  list(data, 'guardrails', 'snapshot').forEach((g, i) => {
    const path = `guardrails[${i}]`;
    if (!isObj(g)) return fail(path, 'expected object');
    for (const key of ['id', 'label', 'help']) str(g, key, path);
    if (guardrailIds.has(g.id)) fail(`${path}.id`, 'duplicate');
    guardrailIds.add(g.id);
    if (typeof g.unit !== 'string') fail(`${path}.unit`, 'expected string');
    for (const key of ['value', 'threshold']) {
      if (g[key] !== null && !Number.isFinite(g[key])) fail(`${path}.${key}`, 'expected number or null');
    }
    oneOf(g, 'comparator', path, ['<=', '>=']);
    oneOf(g, 'thresholdTag', path, ['set', 'provisional', 'unset']);
    if ((g.threshold === null) !== (g.thresholdTag === 'unset')) fail(`${path}.thresholdTag`, 'unset exactly when threshold is null');
    nullableStr(g, 'owner', path);
    nullableDate(g, 'asOf', path);
    oneOf(g, 'status', path, ['ok', 'breached', 'unknown']);
    if (g.value === null || g.threshold === null) {
      if (g.status !== 'unknown') fail(`${path}.status`, 'must be unknown without a value and threshold');
    } else if (Number.isFinite(g.value) && Number.isFinite(g.threshold)) {
      const ok = g.comparator === '<=' ? g.value <= g.threshold : g.value >= g.threshold;
      if (g.status !== (ok ? 'ok' : 'breached')) fail(`${path}.status`, `expected ${ok ? 'ok' : 'breached'} for ${g.value} ${g.comparator} ${g.threshold}`);
    }
  });

  const translations = obj(data, 'translations', 'snapshot');
  for (const key of ['gasPerPayment', 'gasPerSwap']) {
    const c = translations[key];
    const path = `translations.${key}`;
    if (c === null) continue;
    if (!isObj(c)) { fail(path, 'expected object or null'); continue; }
    if (!Number.isFinite(c.value)) fail(`${path}.value`, 'expected number');
    if (c.unit !== 'gas') fail(`${path}.unit`, 'expected gas');
    str(c, 'derivation', path);
    windowRef(c, 'window', path);
  }

  const metric = (m, path) => {
    if (!isObj(m)) return fail(path, 'expected object');
    str(m, 'label', path);
    str(m, 'note', path);
    if (typeof m.unit !== 'string') fail(`${path}.unit`, 'expected string');
    if (!STATUSES.includes(m.status)) fail(`${path}.status`, `expected one of ${STATUSES.join(', ')}`);
    const hasValue = m.status === 'observed' || m.status === 'partial';
    if (hasValue && !Number.isFinite(m.value)) fail(`${path}.value`, `required for ${m.status}`);
    if (!hasValue && m.value !== null) fail(`${path}.value`, `must be null when ${m.status}`);
    if (m.window === null ? hasValue : !Object.hasOwn(windows, m.window)) fail(`${path}.window`, 'expected a key of windows');
    if (m.query !== undefined && typeof m.query !== 'string') fail(`${path}.query`, 'expected string');
    if (m.source !== undefined) link(m.source, `${path}.source`);
  };
  const ids = new Set();
  list(data, 'sections', 'snapshot').forEach((s, i) => {
    const path = `sections[${i}]`;
    if (!isObj(s)) return fail(path, 'expected object');
    for (const key of ['title', 'summary']) str(s, key, path);
    oneOf(s, 'id', path, SECTION_IDS);
    if (ids.has(s.id)) fail(`${path}.id`, 'duplicate');
    ids.add(s.id);
    list(s, 'metrics', path).forEach((m, j) => metric(m, `${path}.metrics[${j}]`));
    list(s, 'gaps', path).forEach((g, j) => typeof g !== 'string' && fail(`${path}.gaps[${j}]`, 'expected string'));
  });

  const linear = (l, path) => {
    if (!isObj(l)) return fail(path, 'expected object or null');
    for (const key of ['projectId', 'state']) str(l, key, path);
    if (l.issueId !== undefined) str(l, 'issueId', path);
    if (!(typeof l.progress === 'number' && l.progress >= 0 && l.progress <= 1)) fail(`${path}.progress`, 'expected a number in [0, 1]');
    for (const key of ['scopeDone', 'scopeTotal']) {
      if (!Number.isInteger(l[key]) || l[key] < 0) fail(`${path}.${key}`, 'expected non-negative integer');
    }
    if (l.targetDate !== undefined) date(l, 'targetDate', path);
    date(l, 'updatedAt', path);
    if (typeof l.url !== 'string' || !l.url.startsWith('https://')) fail(`${path}.url`, 'expected https URL');
  };
  list(data, 'work', 'snapshot').forEach((w, i) => {
    const path = `work[${i}]`;
    if (!isObj(w)) return fail(path, 'expected object');
    oneOf(w, 'area', path, AREAS);
    for (const key of ['title', 'status', 'hypothesis', 'change']) str(w, key, path);
    for (const key of ['owner', 'expected', 'realized']) nullableStr(w, key, path);
    if (w.evidence !== null) link(w.evidence, `${path}.evidence`);
    else if (w.realized !== null) fail(`${path}.evidence`, 'required when realized is set');
    if (w.linear !== null) linear(w.linear, `${path}.linear`);
    list(w, 'links', path).forEach((l, j) => link(l, `${path}.links[${j}]`));
  });

  return errors.length ? { ok: false, errors } : { ok: true, snapshot: data };
}

/**
 * The lowest ceiling with evidence behind it; estimates and unmodeled areas
 * never bind. Null when no area is measured or modeled.
 * @param {Ceiling[]} ceilings
 * @returns {Ceiling | null}
 */
export function deriveBinding(ceilings) {
  let binding = null;
  for (const c of ceilings) {
    if ((c.tag === 'measured' || c.tag === 'modeled') && (binding === null || c.value < binding.value)) binding = c;
  }
  return binding;
}

/**
 * @param {string} collectedAt
 * @param {Date} now
 * @param {number} [days]
 */
export function isStale(collectedAt, now, days = 10) {
  return now.getTime() - Date.parse(collectedAt) > days * DAY_MS;
}
