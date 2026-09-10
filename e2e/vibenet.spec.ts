import { expect, test } from '@playwright/test';

test('vibenet home page loads', async ({ page }) => {
  await page.goto('/vibenet');

  await expect(page).toHaveTitle(/Vibenet · Base Chain/);
  await expect(page.getByText(/ephemeral Base developer network/)).toBeVisible();
});
