import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import ScalingAreaPage from './[area]/page';
import fixture from './fixtures/synthetic.v2.json';
import ScalingGuardrailsPage from './guardrails/page';
import ScalingPage from './page';

// No network in tests: the live archive size is unavailable, so the page keeps the snapshot's.
vi.mock('./archiveSize', async (original) => ({ ...(await original<typeof import('./archiveSize')>()), loadArchiveSize: async () => null }));

beforeEach(() => vi.stubEnv('SCALING_SNAPSHOT_PATH', fileURLToPath(new URL('./fixtures/synthetic.v2.json', import.meta.url))));
afterEach(() => vi.unstubAllEnvs());

const area = async (id: string) => renderToStaticMarkup(await ScalingAreaPage({ params: Promise.resolve({ area: id }) }));

it('ends the first screen with the DA link, and no guardrails or benchmark links', async () => {
  const html = renderToStaticMarkup(await ScalingPage());
  expect(html).toContain('<a class="underline" href="/scaling/da">DA by workload</a>');
  expect(html, 'configured rate and per-block budget use the requested units').toContain('200 Mgas / s (40 Mgas / block)');
  // The guardrails page stays, unlinked, while the first screen leaves guardrails out.
  expect(html).not.toMatch(/href="\/scaling\/guardrails"|Guardrails<\/h2>|SLOs/);
  expect(html).not.toMatch(/href="\/benchmark|href="\/scaling\/networking"/);
  expect(html).not.toContain('Blob utilization');
  expect(html).not.toContain('href="/scaling/runs"');
  expect(html).toMatch(/<h1[^>]*>synthetic-testnet capacity<\/h1>/);
  expect(html).not.toMatch(/As of|manually refreshed|Synthetic fixture: every number/);
});

it('orders the first screen: freshness, headline, ladder, ranked limits, subsystems by workload, work, links', async () => {
  const html = renderToStaticMarkup(await ScalingPage());
  const order = ['200 Mgas / s (40 Mgas / block)', 'Usage to 2026-01-02', 'Proven capacity', 'How close are we, and to what?', 'What breaks first', 'Subsystems by workload', 'Glamsterdam', 'Work log', 'DA by workload'].map((h) => html.indexOf(h));
  expect(order.every((i, k) => i > (order[k - 1] ?? -1))).toBe(true);
  expect(html).not.toMatch(/Subsystem detail|>Progress<|Ceilings by bottleneck|Usage data as of/);
});

/** Verifies the dual-unit header uses configured data and preserves unknown values. */
it.each([
  [1234.5, '1,234.5 Mgas / s (246.9 Mgas / block)'],
  [0, '0 Mgas / s (0 Mgas / block)'],
  [null, '— Mgas / s (— Mgas / block)'],
])('renders configured gas rate %s in both units', async (value, expected) => {
  const path = join(tmpdir(), `scaling-header-${value}.json`);
  writeFileSync(path, JSON.stringify({ ...fixture, ladder: { ...fixture.ladder, configuredLimit: { ...fixture.ladder.configuredLimit, value, tag: value === null ? 'not-established' : fixture.ladder.configuredLimit.tag } } }));
  vi.stubEnv('SCALING_SNAPSHOT_PATH', path);
  const html = renderToStaticMarkup(await ScalingPage());
  expect(html, 'both units reflect the configured limit without substituting sample data').toContain(expected);
  expect(html, 'the editorial explanation labels this as a block gas limit').toContain('Block gas limit');
  if (value === null) expect(html, 'missing configuration is explicitly unavailable').toContain('Configured gas limit unavailable.');
});

it('dates snapshot data without a stale banner', async () => {
  // The fixture is far older than any staleness window.
  expect(renderToStaticMarkup(await ScalingGuardrailsPage())).toContain('Usage data as of 2026-01-02');
  for (const html of [renderToStaticMarkup(await ScalingPage()), renderToStaticMarkup(await ScalingGuardrailsPage()), await area('da')]) expect(html).not.toContain('Stale');
});

it('shows every metric row on its detail page', async () => {
  for (const section of fixture.sections) {
    const html = section.id === 'outcomes' ? renderToStaticMarkup(await ScalingGuardrailsPage()) : await area(section.id);
    for (const m of section.metrics) expect(html).toContain(m.label);
  }
});

it('renders an area with breadcrumb, no as-of line, ceiling, metric details, gaps and a runs slot', async () => {
  const html = await area('da');
  expect(html).toContain('href="/scaling">Scaling</a> / DA');
  expect(html).not.toContain('As of 2026-01-02');
  expect(html).toMatch(/>Ceiling <span[^>]*>· Mgas\/s<\/span>/);
  expect(html).toContain('Lowest: Payments (B20) · 14-blob target, no margin');
  expect(html).toContain('>1,517<');
  expect(html).toMatch(/>DA capacity by workload <span[^>]*>· Mgas\/s<\/span>/);
  expect(html).toContain('synthetic.blob_utilization');
  expect(html).toContain('<li>Confirmed drain</li>');
  expect(html).toContain('Related runs');
});

it('shows the ceiling and an empty state for an area without metrics', async () => {
  const path = join(tmpdir(), 'scaling-no-state-section.json');
  writeFileSync(path, JSON.stringify({ ...fixture, sections: fixture.sections.filter((s) => s.id !== 'state') }));
  vi.stubEnv('SCALING_SNAPSHOT_PATH', path);
  const html = await area('state');
  expect(html).toContain('live-state growth not measured');
  expect(html).toContain('No detailed metrics yet');
});

it('404s an unknown area and networking, which has no ceiling', async () => {
  for (const id of ['bogus', 'networking']) await expect(area(id)).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
});

it('passes the runtime bench and dashboard URLs to the scorecard and footer', async () => {
  expect(renderToStaticMarkup(await ScalingPage())).not.toContain('Loading bench results');
  vi.stubEnv('SCALING_BENCH_BASE_URL', 'https://bench.example.com');
  vi.stubEnv('SCALING_DATADOG_DASHBOARD_URL', 'https://dashboards.example.com/scaling');
  const html = renderToStaticMarkup(await ScalingPage());
  expect(html).toContain('Loading bench results');
  expect(html).toContain('href="https://dashboards.example.com/scaling"');
});

it('adds bench guardrail rows when a bench host is set, unknown until its results load', async () => {
  vi.stubEnv('SCALING_BENCH_BASE_URL', 'https://bench.example.com');
  const html = renderToStaticMarkup(await ScalingGuardrailsPage());
  for (const label of ['Proof history headroom', 'debug_executePayload p99', 'Validator replay headroom']) expect(html).toContain(label);
  expect(html).toContain('No qualifying mainnet-mix bench run is loaded.');
});

it('shows guardrail help inline and the outcomes table on the guardrails page', async () => {
  const html = renderToStaticMarkup(await ScalingGuardrailsPage());
  expect(html).toContain('href="/scaling">Scaling</a> / Guardrails');
  expect(html).not.toContain('As of 2026-01-02');
  for (const g of fixture.guardrails) if (g.id !== 'validator-keep-up') expect(html).toContain(g.help);
  expect(html).toContain('They must stay within 3 blocks.');
  expect(html).not.toContain('Proof history headroom');
  expect(html).not.toContain('Guardrails →');
  expect(html).toContain('Inclusion latency p50');
  expect(html).toContain('synthetic.inclusion_latency');
  expect(html).toContain('2026-01-01 00:00 UTC → 2026-01-02 00:00 UTC');
});
