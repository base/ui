import { expect, test } from '@playwright/test';

test('loads Vercel analytics only on the external target', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('script[src*="/_vercel/insights/script"]')).toHaveCount(
    process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'internal' ? 0 : 1,
  );
});
