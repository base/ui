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

beforeEach(() => vi.stubEnv('SCALING_SNAPSHOT_PATH', fileURLToPath(new URL('./fixtures/synthetic.v2.json', import.meta.url))));
afterEach(() => vi.unstubAllEnvs());

const area = async (id: string) => renderToStaticMarkup(await ScalingAreaPage({ params: Promise.resolve({ area: id }) }));

it('links the first screen to four detail pages instead of listing metric rows', async () => {
  const html = renderToStaticMarkup(await ScalingPage());
  for (const page of ['da', 'execution', 'state', 'guardrails']) expect(html).toContain(`href="/scaling/${page}"`);
  expect(html).not.toContain('href="/scaling/networking"');
  expect(html).not.toContain('Blob utilization');
  expect(html).toContain('href="/scaling/runs"');
});

it('orders the first screen headline, ladder, bottleneck bars, subsystem table, guardrails, progress', async () => {
  const html = renderToStaticMarkup(await ScalingPage());
  const order = ['How much can Base handle', 'How close are we, and to what?', 'What breaks first?', 'Subsystem detail', 'Guardrails →', 'Progress'].map((h) => html.indexOf(h));
  expect(order.every((i, k) => i > (order[k - 1] ?? -1))).toBe(true);
  expect(html).not.toContain('Ceilings by bottleneck');
});

it('shows every metric row on its detail page', async () => {
  for (const section of fixture.sections) {
    const html = section.id === 'outcomes' ? renderToStaticMarkup(await ScalingGuardrailsPage()) : await area(section.id);
    for (const m of section.metrics) expect(html).toContain(m.label);
  }
});

it('renders an area with breadcrumb, as-of header, ceiling, metric details, gaps and a runs slot', async () => {
  const html = await area('da');
  expect(html).toContain('href="/scaling">Scaling</a> / DA');
  expect(html).toContain('As of 2026-01-02 00:00 UTC');
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

it('passes the runtime bench and dashboard URLs to the ladder', async () => {
  expect(renderToStaticMarkup(await ScalingPage())).not.toContain('Loading bench results');
  vi.stubEnv('SCALING_BENCH_BASE_URL', 'https://bench.example.com');
  vi.stubEnv('SCALING_DATADOG_DASHBOARD_URL', 'https://dashboards.example.com/scaling');
  const html = renderToStaticMarkup(await ScalingPage());
  expect(html).toContain('Loading bench results');
  expect(html).toContain('href="https://dashboards.example.com/scaling"');
});

it('adds bench guardrail rows when a bench host is set, unknown until its results load', async () => {
  vi.stubEnv('SCALING_BENCH_BASE_URL', 'https://bench.example.com');
  for (const html of [renderToStaticMarkup(await ScalingGuardrailsPage()), renderToStaticMarkup(await ScalingPage())]) {
    for (const label of ['Proof-node head lag p99', 'debug_executePayload p99', 'Validator replay headroom']) expect(html).toContain(label);
  }
  expect(renderToStaticMarkup(await ScalingGuardrailsPage())).toContain('No qualifying mainnet-mix bench run is loaded.');
});

it('links the first-screen guardrail strip to the guardrails page', async () => {
  expect(renderToStaticMarkup(await ScalingPage())).toContain('<a class="underline" href="/scaling/guardrails">Guardrails →</a>');
});

it('shows guardrail help inline and the outcomes table on the guardrails page', async () => {
  const html = renderToStaticMarkup(await ScalingGuardrailsPage());
  expect(html).toContain('href="/scaling">Scaling</a> / Guardrails');
  expect(html).toContain('As of 2026-01-02 00:00 UTC');
  for (const g of fixture.guardrails) if (g.id !== 'validator-keep-up') expect(html).toContain(g.help);
  expect(html).toContain('They must stay within 3 blocks.');
  expect(html).not.toContain('Proof-node head lag p99');
  expect(html).not.toContain('Guardrails →');
  expect(html).toContain('Inclusion latency p50');
  expect(html).toContain('synthetic.inclusion_latency');
  expect(html).toContain('2026-01-01 00:00 UTC → 2026-01-02 00:00 UTC');
});
