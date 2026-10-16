import { expect, test } from '@playwright/test';

test.skip(process.env.NEXT_PUBLIC_DEPLOY_TARGET !== 'internal', 'requires an internal build');

for (const shadow of [false, true]) {
  test(`${shadow ? 'shadow' : 'canonical'} blocks report failed polls and recover`, async ({ page }) => {
    let failing = true;
    const hash = `0x${'1'.repeat(64)}`;
    const block = {
      hash, number: 42, timestamp: Math.floor(Date.now() / 1000),
      gasUsed: '1', gasLimit: '100', transactionCount: 2,
    };
    await page.route('**/api/internal-explorer/blocks?*', (route) => route.fulfill({
      status: failing ? 503 : 200,
      json: failing ? { error: 'Block list unavailable' } : { blocks: [block] },
    }));
    await page.route('**/api/internal-explorer/shadow-blocks?*', (route) => route.fulfill({
      status: failing ? 503 : 200,
      json: failing ? { error: 'Shadow blocks unavailable' } : [{ ...block, canonicalHash: hash }],
    }));
    await page.route('**/api/internal-explorer/blocks-by-numbers?*', (route) => route.fulfill({ json: [block] }));
    await page.goto(`/internal-explorer${shadow ? '?shadowDelta=1' : ''}`);
    const error = page.locator('main [role="alert"]');
    await expect(error).toContainText('Unable to refresh blocks');
    await expect(page.getByText('No blocks available', { exact: true })).toBeHidden();
    await expect(page.getByText('Blocks unavailable', { exact: true })).toBeVisible();

    failing = false;
    await expect(page.getByText('#42', { exact: true })).toBeVisible();
    await expect(error).toBeHidden();

    failing = true;
    await expect(error).toContainText('Showing the last successful result');
    await expect(page.getByText('#42', { exact: true })).toBeVisible();

    failing = false;
    await expect(error).toBeHidden();
  });
}
