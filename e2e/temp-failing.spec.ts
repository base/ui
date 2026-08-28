import { expect, test } from '@playwright/test';

// TEMPORARY: intentionally fails to verify the CI job uploads a screenshot
// and trace artifact on failure. Remove this file once that's confirmed.
test('temporary failure to validate artifact upload', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('this text does not exist on the page')).toBeVisible();
});
