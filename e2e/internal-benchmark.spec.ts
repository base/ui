import { expect, test, type Locator } from '@playwright/test';

test.skip(process.env.NEXT_PUBLIC_DEPLOY_TARGET !== 'internal', 'requires an internal build');
test.use({ viewport: { width: 390, height: 844 } });

const run = {
  id: 'example', sourceFile: 'example.json', outputDir: 'example',
  testName: 'Example performance benchmark with a long descriptive run name',
  testDescription: 'A synthetic benchmark run used to verify that the full description and download controls remain readable on narrow screens.',
  createdAt: '2026-01-01T00:00:00Z',
  testConfig: { BenchmarkRun: 'example', GasLimit: 150000000, BlockTimeMilliseconds: 1000 },
  result: { success: true, complete: true, sequencerMetrics: { gasPerSecond: 1, forkChoiceUpdated: 0.01, getPayload: 0.02 }, validatorMetrics: { gasPerSecond: 1, newPayload: 0.03 } },
};

async function insideViewport(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/output/metadata.json', (route) => route.fulfill({ json: { runs: [run] } }));
  await page.route('**/output/example/metrics-*.json', (route) => route.fulfill({ json: [
    { BlockNumber: 1, ExecutionMetrics: { 'latency/get_payload': 0.01 } },
    { BlockNumber: 2, ExecutionMetrics: { 'latency/get_payload': 0.02 } },
  ] }));
});

test('run selector and downloads fit a narrow viewport', async ({ page }) => {
  await page.goto('/benchmark/run/latest');
  await insideViewport(page.getByRole('combobox', { name: 'Benchmark run' }));
  const download = page.locator('button[aria-label="Download run information"]');
  await download.scrollIntoViewIfNeeded();
  await insideViewport(download);
  await download.click();
  await insideViewport(page.getByRole('button', { name: 'Download as JSON', exact: true }));
});

test('comparison charts fit a narrow viewport', async ({ page }) => {
  await page.goto('/benchmark/run-comparison/example');
  await insideViewport(page.getByRole('combobox', { name: 'Benchmark run' }));
  await insideViewport(page.getByRole('link', { name: 'Blocks View All Runs' }));
  await insideViewport(page.locator('.chart-container').first());
  const chart = page.locator('.chart-container').first();
  const svg = (await chart.locator('svg').boundingBox())!;
  const legend = (await chart.locator('.legend').boundingBox())!;
  expect(legend.y + legend.height).toBeLessThanOrEqual(svg.y + svg.height);
});
