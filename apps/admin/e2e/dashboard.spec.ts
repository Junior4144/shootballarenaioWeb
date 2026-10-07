import { test, expect, type Page } from '@playwright/test';
const token = 'local-browser-test-token-not-a-hosted-credential';
async function login(page: Page) {
  await page.goto('/'); await page.getByLabel('Local session token').fill(token);
  await page.getByRole('button', { name: 'Open control room' }).click();
  await expect(page.getByRole('heading', { name: 'Registered servers' })).toBeVisible();
}
for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 390, height: 844 }]) {
  test(`navigation, inventory and architecture at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); await login(page);
    await expect(page.getByText('LOCAL FIXTURE — sample inventory;', { exact: false })).toBeVisible();
    if (viewport.width < 700) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Servers' }).click();
    await expect(page.getByRole('cell', { name: 'RUNNING', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start server', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`servers-${viewport.width}.png`), fullPage: true });
    if (viewport.width < 700) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Architecture' }).click();
    await page.locator('[data-node="frontend"]').click();
    await expect(page.getByText('Main-branch releases deploy automatically.', { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`architecture-${viewport.width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('combobox', { name: 'Environment' })).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: 'Registered servers' })).toHaveCount(0);
});


test('settings drafts validate imports, preview maps and survive navigation without changing gameplay',async({page})=>{
  await login(page);
  await expect(page.getByRole('link',{name:'Open website — Vercel (primary)'})).toHaveAttribute('href','https://shootball-arena.vercel.app');
  await expect(page.getByRole('link',{name:'Open GCP origin (direct)'})).toHaveAttribute('href','https://shootball-control-test-730016272076.us-central1.run.app');
  await page.getByRole('navigation').getByRole('button',{name:'Game settings'}).click();
  await expect(page.getByRole('img',{name:'Draft map walls, spawns and pickups'})).toBeVisible();
  await page.getByLabel('player.speed',{exact:true}).fill('250');await page.getByLabel('player.speed',{exact:true}).blur();
  await expect(page.getByRole('heading',{name:'Changes from build defaults (1)'})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Overview'}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true,level:1})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Game settings'}).click();
  await expect(page.getByLabel('player.speed',{exact:true})).toHaveValue('250');
  await page.getByLabel('Complete configuration').fill('{"player":null}');
  await page.getByRole('button',{name:'Validate and apply to draft'}).click();
  await expect(page.getByRole('status')).toContainText('player must be an object');
  await expect(page.getByRole('button',{name:'Download validated draft'})).toBeDisabled();
  await page.getByRole('button',{name:'Reset draft'}).click();
  await expect(page.getByLabel('player.speed',{exact:true})).toHaveValue('220');
  await expect(page.getByRole('button',{name:'Download validated draft'})).toBeEnabled();
});
test('health checks show separate primary and origin status; directories paginate and escape content',async({page})=>{
  await page.route('**/admin/v1/health?**',r=>r.fulfill({json:{source:'Fixture observations',checks:[{id:'primary',name:'Vercel primary website',url:'https://shootball-arena.vercel.app/health',status:'unavailable',checkedAt:new Date().toISOString(),latencyMs:20,revision:null,message:'Check failed'},{id:'origin',name:'GCP direct origin',url:'https://shootball-control-test-730016272076.us-central1.run.app/health',status:'healthy',checkedAt:new Date().toISOString(),latencyMs:10,revision:'test',message:'Liveness passed'}]}}));
  const offsets:string[]=[];
  await page.route('**/admin/v1/accounts?**',r=>{const offset=new URL(r.request().url()).searchParams.get('offset')!;offsets.push(offset);return r.fulfill({json:{source:'Fixture accounts',rows:[{id:'test-user',display_name:'<script>bad</script>',created_at:'2026-10-07',last_sign_in_at:null,email_confirmed:true}],offset:Number(offset),limit:50,hasMore:offset==='0'}});});
  await login(page);await page.getByRole('navigation').getByRole('button',{name:'Health & alerts'}).click();
  await expect(page.getByRole('heading',{name:'Vercel primary website'})).toBeVisible();await expect(page.getByText('1 endpoint check(s) failed.')).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Accounts & guests'}).click();
  await expect(page.getByRole('cell',{name:'<script>bad</script>'})).toBeVisible();
  await page.getByRole('button',{name:'Next page'}).click();await expect(page.getByText('Page 2',{exact:true})).toBeVisible();expect(offsets).toContain('50');
});
