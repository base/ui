import { expect, test } from '@playwright/test';

test('faucet page loads', async ({ page }) => {
  await page.goto('/vibenet/faucet');

  await expect(page).toHaveTitle(/Faucet · Vibenet/);
  await expect(page.getByText('Recipient Address', { exact: true })).toBeVisible();
});
