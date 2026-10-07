import { dashboard } from '../../admin-api/src/dashboard';
import { FixtureInventory } from '../../admin-api/src/inventory';
import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
let server: ViteDevServer;
test.beforeAll(async () => {
  server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), mode: 'live', server: { host: '127.0.0.1', port: 5192, strictPort: true } });
  await server.listen();
});
test.afterAll(async () => { await server?.close(); });
test('local live UI uses production login and labels production data', async ({ page }) => {
  await page.route('**/admin/config', route => route.fulfill({ json: { mode: 'supabase', environment: 'production', supabaseUrl: 'https://lkgxpgcmspxekggndzih.supabase.co', publishableKey: 'sb_publishable_fixture' } }));
  const project = 'https://lkgxpgcmspxekggndzih.supabase.co';
  await page.route(project + '/auth/v1/token**', route => route.fulfill({ json: { access_token: 'fixture', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } } }));
  await page.route('**/admin/v1/session?**', route => {
    expect(new URL(route.request().url()).searchParams.get('environment')).toBe('production');
    expect(route.request().headers().authorization).toBe('Bearer fixture');
    return route.fulfill({ json: { status: 'allowed' } });
  });
  await page.route('**/admin/v1/dashboard?**', async route => route.fulfill({ json: await dashboard('production', new FixtureInventory()) }));
  await page.route('**/admin/v1/telemetry?**', route => route.fulfill({ status: 503, json: { error: 'Unavailable in test' } }));
  await page.goto('http://127.0.0.1:5192/admin/');
  await expect(page.getByText('Local UI · Production data', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to game' })).toHaveAttribute('href', 'https://shootball-arena.vercel.app');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registered servers' })).toBeVisible();
  await expect(page.getByText('Local UI · Production data', { exact: true })).toBeVisible();
  await expect(page.locator('#environment')).toHaveText('Production');
  // The deployed API can still be old while local traffic UI is new.
  let oldApiCalls=0, revoked=false;
  const reads: Array<{p_source:string;p_range:string;p_environment:string}>=[];
  await page.route('**/admin/v1/traffic?**',route=>{oldApiCalls++;return route.fulfill({status:404,json:{error:'Not found'}});});
  await page.route(project+'/auth/v1/logout**',route=>route.fulfill({status:204}));
  await page.route(project+'/rest/v1/rpc/admin_traffic_history',route=>{
    expect(route.request().headers().authorization).toBe('Bearer fixture');
    expect(route.request().headers().apikey).toBe('sb_publishable_fixture');
    const params=route.request().postDataJSON();reads.push(params);
    expect(params.p_environment).toBe('production');
    if(revoked)return route.fulfill({status:403,json:{code:'42501',message:'Administrator access required'}});
    const point={at:new Date().toISOString(),samples:1,players:6,guests:4,accounts:2,rooms:1,peak:6,joins:1,completed:0,views:4,sessions:2};
    return route.fulfill({json:{source:params.p_source,range:params.p_range,current:[point],previous:[point],bucketSeconds:60,generatedAt:new Date().toISOString(),latestSampleAt:point.at,retentionDays:62}});
  });
  await page.getByRole('navigation').getByRole('button',{name:'Traffic & engagement'}).click();
  await expect(page.locator('.traffic-chart')).toBeVisible();
  await expect(page.locator('.traffic-metrics article').nth(1).locator('strong')).toHaveText('6');
  await page.getByRole('button',{name:'Website traffic',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Page views over time'})).toBeVisible();
  await page.getByRole('button',{name:'7d',exact:true}).click();
  await expect.poll(()=>reads.some(r=>r.p_source==='website' && r.p_range==='7d')).toBe(true);
  expect(oldApiCalls).toBe(0);
  revoked=true;
  await page.locator('#refresh').click();
  await expect(page.getByRole('heading',{name:'Admin sign in',exact:true})).toBeVisible();
  await expect(page.locator('.traffic-chart')).toHaveCount(0);
});
test('live UI refuses fixture authentication instead of silently switching data', async ({ page }) => {
  await page.route('**/admin/config', route => route.fulfill({ json: { mode: 'local', environment: 'local' } }));
  await page.goto('http://127.0.0.1:5192/admin/');
  await expect(page.locator('#app')).toContainText('Admin authentication service unavailable');
  await expect(page.getByLabel('Local session token')).toHaveCount(0);
});
