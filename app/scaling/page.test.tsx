import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

import ScalingPage from './page';

it('collapses each detail section by default with its title and row count', async () => {
  vi.stubEnv('SCALING_SNAPSHOT_PATH', fileURLToPath(new URL('./fixtures/synthetic.v2.json', import.meta.url)));
  const html = renderToStaticMarkup(await ScalingPage());
  expect(html).toMatch(/<details><summary[^>]*><h2[^>]*>Data availability<\/h2><span[^>]*> · 2 rows<\/span>/);
  expect(html).not.toContain('<details open');
  vi.unstubAllEnvs();
});
