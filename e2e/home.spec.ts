import { expect, test } from '@playwright/test';

test('home page loads and shows the landing copy', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Monitor and test Base, all in one place.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /vibenet/i })).toBeVisible();
});
