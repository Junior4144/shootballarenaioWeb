import { test, expect } from '@playwright/test';

for (const width of [1366, 320]) {
  test(`public game guide is readable without JavaScript at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 844 } });
    try {
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:5189/');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('#game-overview-title')).toBeVisible();
      await expect(page.locator('#how-to-play')).toContainText('1,000 points');
      await expect(page.locator('.public-controls')).toContainText('Hold to sprint');
      await page.getByRole('link', { name: 'How to play & controls' }).click();
      await expect(page.locator('#game-overview-title')).toBeInViewport();
      expect(await page.locator('#account-screen').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.getByRole('link', { name: 'Back to play options' }).click();
      await expect(page.locator('h1')).toBeInViewport();
    } finally { await context.close(); }
  });
}
