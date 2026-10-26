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

it('links the first screen to five detail pages instead of listing metric rows', async () => {
  const html = renderToStaticMarkup(await ScalingPage());
  for (const page of ['da', 'execution', 'state', 'networking', 'guardrails']) expect(html).toContain(`href="/scaling/${page}"`);
  expect(html).not.toContain('Blob utilization');
  expect(html).toContain('href="/scaling/runs"');
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
  expect(html).toContain('Payments (B20 transfer) · 57 Mgas/s · 1,517 tx/s · provisional');
  expect(html).toContain('Mainnet mix · 190 Mgas/s · 981 tx/s · observed · 2026-10-26');
  expect(html).toMatch(/>DA capacity by workload <span[^>]*>· Mgas\/s<\/span>/);
  expect(html).toContain('synthetic.blob_utilization');
  expect(html).toContain('<li>Confirmed drain</li>');
  expect(html).toContain('Related runs');
});

it('shows the ceiling and an empty state for an area without metrics', async () => {
  const html = await area('networking');
  expect(html).toContain('gossip and peer limits unknown');
  expect(html).toContain('No detailed metrics yet');
});

it('404s an unknown area', async () => {
  await expect(area('bogus')).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
});

it('passes the runtime bench and dashboard URLs to the proven-capacity section', async () => {
  expect(renderToStaticMarkup(await ScalingPage())).toContain('Bench results not configured');
  vi.stubEnv('SCALING_BENCH_BASE_URL', 'https://bench.example.com');
  vi.stubEnv('SCALING_DATADOG_DASHBOARD_URL', 'https://dashboards.example.com/scaling');
  const html = renderToStaticMarkup(await ScalingPage());
  expect(html).toContain('Loading bench results');
  expect(html).toContain('href="https://dashboards.example.com/scaling"');
});

it('links the first-screen guardrail strip to the guardrails page', async () => {
  expect(renderToStaticMarkup(await ScalingPage())).toContain('<a class="underline" href="/scaling/guardrails">Guardrails →</a>');
});

it('shows guardrail help inline and the outcomes table on the guardrails page', async () => {
  const html = renderToStaticMarkup(await ScalingGuardrailsPage());
  expect(html).toContain('href="/scaling">Scaling</a> / Guardrails');
  expect(html).toContain('As of 2026-01-02 00:00 UTC');
  for (const g of fixture.guardrails) expect(html).toContain(g.help);
  expect(html).not.toContain('Guardrails →');
  expect(html).toContain('Inclusion latency p50');
  expect(html).toContain('synthetic.inclusion_latency');
  expect(html).toContain('2026-01-01 00:00 UTC → 2026-01-02 00:00 UTC');
});
