import { expect, test } from '@playwright/test';

test('home page loads and shows the landing copy', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText("Base's Building Ground")).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /^Vibenet/i })).toBeVisible();
});
