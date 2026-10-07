import { test, expect } from '@playwright/test';
const project = 'https://lkgxpgcmspxekggndzih.supabase.co';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
test('hosted /admin denies ordinary users and guides approved admins into MFA', async ({ page }) => {
  await page.route('**/admin/config', r => r.fulfill({ json: { mode: 'supabase', supabaseUrl: project, publishableKey: 'sb_publishable_fixture', environment: 'gcp-test' } }));
  await page.route(project + '/auth/v1/token**', r => r.fulfill({ json: { access_token: 'fixture', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user } }));
  await page.route(project + '/auth/v1/logout**', r => r.fulfill({ status: 204 }));
  let member = false;
  await page.route('**/admin/v1/session?**', r => r.fulfill({ status: member ? 200 : 403, json: { status: member ? 'mfa-required' : 'denied' } }));
  await page.route(project + '/auth/v1/user', r => r.fulfill({ json: { ...user, factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified', friendly_name: 'ShootBall admin', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] } }));
  await page.goto('/admin/');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test'); await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('does not have admin access');
  member = true;
  await page.getByLabel('Password', { exact: true }).fill('fixture-password'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Humans online' })).toHaveCount(0);
});
