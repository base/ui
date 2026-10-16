import { expect, test } from '@playwright/test';

test.skip(process.env.NEXT_PUBLIC_DEPLOY_TARGET !== 'internal', 'requires an internal build');

const run = {
  id: 'example', sourceFile: 'example.json', outputDir: 'example',
  testName: 'Example performance benchmark with a long descriptive run name',
  testDescription: 'A synthetic benchmark run used to verify report panels, chart labels, and download menus in both themes.',
  createdAt: '2026-01-01T00:00:00Z',
  testConfig: { BenchmarkRun: 'example', GasLimit: 150000000, BlockTimeMilliseconds: 1000 },
  result: { success: true, complete: true, sequencerMetrics: { gasPerSecond: 1, forkChoiceUpdated: 0.01, getPayload: 0.02 }, validatorMetrics: { gasPerSecond: 1, newPayload: 0.03 } },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/output/metadata.json', (route) => route.fulfill({ json: { runs: [run] } }));
  await page.route('**/output/example/metrics-*.json', (route) => route.fulfill({ json: [
    { BlockNumber: 1, ExecutionMetrics: { 'latency/get_payload': 0.01 } },
    { BlockNumber: 2, ExecutionMetrics: { 'latency/get_payload': 0.02 } },
  ] }));
});

test.describe('dark theme', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('run panels and portaled downloads follow the theme switch', async ({ page }) => {
    await page.goto('/benchmark/run/latest');
    const root = page.locator('.benchmark-root');
    const light = await root.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByRole('switch', { name: 'Dark mode' }).click();
    await expect(root).toHaveCSS('background-color', 'rgb(17, 17, 17)');
    await page.locator('button[aria-label="Download all run information"]').click();
    const menu = page.getByRole('button', { name: 'Download All as JSON' }).locator('../..');
    await expect(menu).toHaveCSS('background-color', 'rgb(38, 38, 38)');
    await page.keyboard.press('Escape');
    await page.getByRole('switch', { name: 'Dark mode' }).click();
    await expect(root).toHaveCSS('background-color', light);
    await page.getByRole('switch', { name: 'Dark mode' }).click();
  });

  test('chart labels remain readable after switching themes', async ({ page }) => {
    await page.goto('/benchmark/run-comparison/example');
    const chart = page.locator('.chart-container').first();
    await expect(chart).toBeVisible();
    await page.getByRole('switch', { name: 'Dark mode' }).click();
    await expect(chart).toHaveCSS('background-color', 'rgb(38, 38, 38)');
    await expect(chart.locator('.x-axis-label')).toHaveCSS('fill', 'rgb(255, 255, 255)');
    await expect(chart.locator('svg > g > text').first()).toHaveCSS('fill', 'rgb(255, 255, 255)');
  });

  test('load-test tables follow the selected theme', async ({ page }) => {
    await page.route('**/api/v1/load-tests/sepolia', (route) => route.fulfill({
      json: [{ network: 'sepolia', timestamp: '2026-01-01T00-00-00' }],
    }));
    await page.goto('/benchmark/load-tests/sepolia/all');
    await expect(page.getByRole('link', { name: 'View →' })).toBeVisible();
    await page.getByRole('switch', { name: 'Dark mode' }).click();
    await expect(page.locator('table').locator('..')).toHaveCSS('background-color', 'rgb(38, 38, 38)');
    await expect(page.getByRole('heading', { name: 'All load test runs' })).toHaveCSS('color', 'rgb(255, 255, 255)');
  });
});
