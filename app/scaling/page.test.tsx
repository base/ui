import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import fixture from './fixtures/synthetic.v2.json';
import ScalingGuardrailsPage from './guardrails/page';
import ScalingPage from './page';

beforeEach(() => vi.stubEnv('SCALING_SNAPSHOT_PATH', fileURLToPath(new URL('./fixtures/synthetic.v2.json', import.meta.url))));
afterEach(() => vi.unstubAllEnvs());

it('collapses each detail section by default with its title and row count', async () => {
  const html = renderToStaticMarkup(await ScalingPage());
  expect(html).toMatch(/<details><summary[^>]*><h2[^>]*>Data availability<\/h2><span[^>]*> · 2 rows<\/span>/);
  expect(html).not.toContain('<details open');
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
