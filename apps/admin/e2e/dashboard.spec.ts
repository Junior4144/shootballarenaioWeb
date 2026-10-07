import { test, expect, type Page } from '@playwright/test';
const token = 'local-browser-test-token-not-a-hosted-credential';
async function login(page: Page) {
  await page.goto('/'); await page.getByLabel('Local session token').fill(token);
  await page.getByRole('button', { name: 'Open control room' }).click();
  await expect(page.getByRole('heading', { name: 'Humans online' })).toBeVisible();
}
for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 390, height: 844 }]) {
  test(`navigation, inventory and architecture at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await login(page);
    await expect(page.getByText('LOCAL FIXTURE — sample inventory;', { exact: false })).toBeVisible();
    if (viewport.width < 700) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Servers & matches' }).click();
    await expect(page.getByRole('cell', { name: 'RUNNING', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start server', exact: true })).toBeDisabled();
    await page.screenshot({ path: `../../.test-artifacts/admin/servers-${viewport.width}.png`, fullPage: true });
    if (viewport.width < 700) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Architecture & health' }).click();
    await page.getByRole('button', { name: /Player frontend/ }).first().click();
    await expect(page.getByText('No deployment or domain is registered.', { exact: false })).toBeVisible();
    await page.screenshot({ path: `../../.test-artifacts/admin/architecture-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Environment', { exact: true }).selectOption('gcp-test');
    await expect(page.getByRole('heading', { name: 'Architecture & health' })).toBeVisible();
    await page.reload(); await page.getByLabel('Local session token').fill(token); await page.getByRole('button', { name: 'Open control room' }).click();
    await expect(page.getByLabel('Environment', { exact: true })).toHaveValue('gcp-test');
    await expect(page.getByText('Live inventory is not enabled.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click(); await expect(page.getByLabel('Local session token')).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain(token);
  });
}
test('bad token and API outage expose no privileged data or fabricated zeroes', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Local session token').fill('invalid-local-session-token-0000000000');
  await page.getByRole('button', { name: 'Open control room' }).click();
  await expect(page.getByRole('alert')).toContainText('Session rejected');
  await login(page);
  await page.route('**/admin/v1/**', route => route.fulfill({ status: 503, body: '{}' }));
  await page.getByRole('button', { name: 'Refresh', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('Admin API unavailable');
  await expect(page.getByRole('heading', { name: 'Humans online' })).toHaveCount(0);
});
