import { expect, test } from '@playwright/test';

test('home page loads and shows the landing copy', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText("Base Developer Console")).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /^All Demos/i })).toBeVisible();
});
