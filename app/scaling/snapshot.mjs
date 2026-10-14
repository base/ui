// Scaling scorecard snapshot format. Authored as .mjs (like deploy.config.mjs)
// so both the app and plain-node scripts can import it.
//
// A snapshot is a reviewed, dated set of observations, not live data. Real
// snapshots hold internal measurements, so they stay outside this public repo.

/**
 * @typedef {'observed' | 'partial' | 'unavailable' | 'not-measured'} MetricStatus
 * @typedef {{ label: string, url: string }} Link
 * @typedef {{ label: string, start: string, end: string }} Window
 * @typedef {{
 *   label: string, status: MetricStatus, value: number | null, unit: string,
 *   window: string | null, note: string, query?: string, source?: Link
 * }} Metric
 * @typedef {{ id: string, title: string, summary: string, metrics: Metric[], gaps: string[] }} Section
 * @typedef {{
 *   title: string, status: string, owner: string | null, hypothesis: string,
 *   change: string, impact: string, evidence: string, links: Link[]
 * }} WorkItem
 * @typedef {{
 *   schemaVersion: 1, network: string, collectedAt: string, context: string,
 *   windows: Record<string, Window>, headline: Metric[], sections: Section[], work: WorkItem[]
 * }} Snapshot
 */

const STATUSES = ['observed', 'partial', 'unavailable', 'not-measured'];

/**
 * Missing values must be explicit nulls with a non-observed status, never
 * zeros, so the page shows them as unknown.
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
  const date = (o, key, path) => {
    if (typeof o[key] !== 'string' || Number.isNaN(Date.parse(o[key]))) fail(`${path}.${key}`, 'expected ISO timestamp');
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

  if (!isObj(data)) return { ok: false, errors: ['snapshot: expected object'] };
  if (data.schemaVersion !== 1) fail('schemaVersion', 'expected 1');
  str(data, 'network', 'snapshot');
  date(data, 'collectedAt', 'snapshot');
  str(data, 'context', 'snapshot');

  const windows = isObj(data.windows) ? data.windows : {};
  if (!isObj(data.windows)) fail('windows', 'expected object');
  for (const [id, w] of Object.entries(windows)) {
    if (!isObj(w)) { fail(`windows.${id}`, 'expected object'); continue; }
    str(w, 'label', `windows.${id}`);
    date(w, 'start', `windows.${id}`);
    date(w, 'end', `windows.${id}`);
    if (Date.parse(w.start) >= Date.parse(w.end)) fail(`windows.${id}`, 'start must precede end');
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

  list(data, 'headline', 'snapshot').forEach((m, i) => metric(m, `headline[${i}]`));
  const ids = new Set();
  list(data, 'sections', 'snapshot').forEach((s, i) => {
    const path = `sections[${i}]`;
    if (!isObj(s)) return fail(path, 'expected object');
    for (const key of ['id', 'title', 'summary']) str(s, key, path);
    if (ids.has(s.id)) fail(`${path}.id`, 'duplicate');
    ids.add(s.id);
    list(s, 'metrics', path).forEach((m, j) => metric(m, `${path}.metrics[${j}]`));
    list(s, 'gaps', path).forEach((g, j) => typeof g !== 'string' && fail(`${path}.gaps[${j}]`, 'expected string'));
  });
  list(data, 'work', 'snapshot').forEach((w, i) => {
    const path = `work[${i}]`;
    if (!isObj(w)) return fail(path, 'expected object');
    for (const key of ['title', 'status', 'hypothesis', 'change', 'impact', 'evidence']) str(w, key, path);
    if (w.owner !== null && typeof w.owner !== 'string') fail(`${path}.owner`, 'expected string or null');
    list(w, 'links', path).forEach((l, j) => link(l, `${path}.links[${j}]`));
  });

  return errors.length ? { ok: false, errors } : { ok: true, snapshot: data };
}
