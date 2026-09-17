import { expect, test } from '@playwright/test';

// The explorer polls the live vibenet API, which is reset from time to time, so
// these tests assert that blocks and transactions are present in general and can
// be opened — never that a specific block or transaction exists. Right after a
// reset there may be no transactions yet, so the transaction cases tolerate the
// empty state rather than flaking.
const ROW_TIMEOUT = 20_000;

test('explorer page loads with latest blocks and transactions', async ({ page }) => {
  await page.goto('/vibenet/explorer');

  await expect(page).toHaveTitle(/Explorer · Vibenet/);
  await expect(page.getByText('Latest Blocks')).toBeVisible();
  await expect(page.getByText('Latest Transactions')).toBeVisible();

  // A running chain always has blocks; transactions can be momentarily empty
  // after a reset, so accept the empty state there.
  await expect(page.locator('tr[aria-label^="Block "]').first()).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
  const txRow = page.locator('tr[aria-label^="Transaction "]').first();
  await expect(txRow.or(page.getByText('No transactions yet'))).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
});

test('explorer opens the latest block', async ({ page }) => {
  await page.goto('/vibenet/explorer');

  const latestBlock = page.locator('tr[aria-label^="Block "]').first();
  await expect(latestBlock).toBeVisible({ timeout: ROW_TIMEOUT });
  await latestBlock.getByRole('link').first().click();

  await expect(page).toHaveURL(/\/vibenet\/explorer\/block\//);
  await expect(page.getByText('Gas Limit')).toBeVisible({ timeout: ROW_TIMEOUT });
});

test('explorer opens the latest transaction', async ({ page }) => {
  await page.goto('/vibenet/explorer');

  const latestTx = page.locator('tr[aria-label^="Transaction "]').first();
  await expect(latestTx.or(page.getByText('No transactions yet'))).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
  // Nothing to open right after a reset — skip rather than fail.
  test.skip(
    await page.getByText('No transactions yet').isVisible(),
    'no transactions on vibenet yet',
  );

  await latestTx.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/vibenet\/explorer\/tx\//);
  await expect(page.getByText(/^Logs \(/)).toBeVisible({ timeout: ROW_TIMEOUT });
});
