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
  await expect(page.getByRole('heading', { name: 'Registered servers' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Showing previous observations');
});


test('settings drafts validate imports, preview maps and survive navigation without changing gameplay',async({page})=>{
  await login(page);
  await expect(page.getByRole('link',{name:'Open website — Orb-skirmish (primary)'})).toHaveAttribute('href','https://www.orb-skirmish.com');
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
  await page.route('**/admin/v1/health?**',r=>r.fulfill({json:{source:'Fixture observations',checks:[{id:'primary',name:'Orb-skirmish primary website',url:'https://www.orb-skirmish.com/health',status:'unavailable',checkedAt:new Date().toISOString(),latencyMs:20,revision:null,message:'Check failed'},{id:'origin',name:'GCP direct origin',url:'https://shootball-control-test-730016272076.us-central1.run.app/health',status:'healthy',checkedAt:new Date().toISOString(),latencyMs:10,revision:'test',message:'Liveness passed'}]}}));
  const offsets:string[]=[];
  await page.route('**/admin/v1/accounts?**',r=>{const offset=new URL(r.request().url()).searchParams.get('offset')!;offsets.push(offset);return r.fulfill({json:{source:'Fixture accounts',rows:[{id:'test-user',display_name:'<script>bad</script>',email:'player@example.com',phone:'+15555550100',account_type:'registered',providers:['email'],created_at:'2026-10-07',last_sign_in_at:null,email_confirmed:true}],offset:Number(offset),limit:50,hasMore:offset==='0'}});});
  await login(page);await page.getByRole('navigation').getByRole('button',{name:'Health & alerts'}).click();
  await expect(page.getByRole('heading',{name:'Orb-skirmish primary website'})).toBeVisible();await expect(page.getByText('1 endpoint check(s) failed.')).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Accounts & guests'}).click();
  await expect(page.getByRole('cell',{name:'<script>bad</script>'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'player@example.com'})).toBeVisible();
  await page.getByRole('button',{name:'Next page'}).click();await expect(page.getByText('Page 2',{exact:true})).toBeVisible();expect(offsets).toContain('50');
});

test('polling retains account rows, draft search, focus and scroll; failures retain results and revoked access clears them', async ({page}) => {
  await page.clock.install();
  let calls = 0;
  let release!: () => void;
  let delayed = false;
  let failure = 0;
  await page.route('**/admin/v1/accounts?**', async route => {
    calls++;
    if (delayed) await new Promise<void>(resolve => {release = resolve;});
    if (failure) return route.fulfill({status:failure,json:{error:'Directory temporarily unavailable'}});
    await route.fulfill({json:{source:'Fixture accounts',rows:[{id:'account-1',display_name:'Player',email:'player@example.com',phone:'+15555550100',providers:['email'],account_type:'registered',created_at:'2026-10-07',last_sign_in_at:null,email_confirmed:true}],offset:0,limit:50,hasMore:false}});
  });
  await login(page);
  await expect(page.locator('#refresh')).toBeEnabled();
  await page.getByRole('navigation').getByRole('button',{name:'Accounts & guests'}).click();
  await expect(page.getByRole('cell',{name:'player@example.com'})).toBeVisible();
  const input = page.locator('#record-query');
  await input.fill('unfinished search'); await input.blur();
  const original = await input.elementHandle();
  await page.locator('.table-wrap').evaluate(el => {el.scrollLeft=150;});
  delayed = true;
  await page.clock.fastForward(15_000);
  await expect.poll(()=>calls).toBe(2);
  await expect(page.getByRole('cell',{name:'player@example.com'})).toHaveCount(1);
  await expect(page.locator('[data-refresh-status]')).toHaveText('Updating…');
  await input.focus();
  release(); delayed = false;
  await expect(page.locator('#refresh')).toBeEnabled();
  expect(await original!.evaluate(el => el.isConnected)).toBe(true);
  await expect(input).toBeFocused(); await expect(input).toHaveValue('unfinished search');
  expect(await page.locator('.table-wrap').evaluate(el=>el.scrollLeft)).toBe(150);
  failure = 503;
  await page.locator('#refresh').click();
  await expect(page.locator('[data-refresh-status]')).toContainText('showing previous results');
  await expect(page.getByRole('cell',{name:'player@example.com'})).toHaveCount(1);
  failure = 403;
  await page.locator('#refresh').click();
  await expect(page.getByLabel('Local session token')).toBeVisible();
  await expect(page.getByRole('cell',{name:'player@example.com'})).toHaveCount(0);
});
test('website health probes run from browser after API response without bearer credentials', async ({page}) => {
  const probes:string[]=[];
  await page.route('**/admin/v1/health?**', route=>route.fulfill({json:{browserChecks:true,source:'Browser websites and server gameplay',checks:[]}}));
  for (const host of ['https://www.orb-skirmish.com','https://shootball-control-test-730016272076.us-central1.run.app']) {
    await page.route(host+'/health', async route=>{
      probes.push(route.request().url());
      expect(route.request().headers().authorization).toBeUndefined();
      expect(route.request().headers().cookie).toBeUndefined();
      await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{status:'live',revision:'release-fixture'}});
    });
  }
  await login(page); await page.getByRole('navigation').getByRole('button',{name:'Health & alerts'}).click();
  await expect(page.getByText('All configured endpoint checks passed.')).toBeVisible();
  expect(probes).toHaveLength(2);
});

test('traffic metrics update in place across polling cycles and late responses cannot replace another tab', async ({page})=>{
  await page.clock.install();
  let joins = 1;
  let release!:()=>void;
  let delayed = false;
  let calls = 0;
  await page.route('**/admin/v1/traffic?**',route=>route.fulfill({json:{source:'game',range:'24h',generatedAt:new Date().toISOString(),bucketSeconds:900,retentionDays:62,latestSampleAt:new Date().toISOString(),current:[{at:new Date().toISOString(),samples:1,players:joins,guests:joins,accounts:0,rooms:1,peak:joins,joins:joins,completed:0}],previous:[{at:new Date(Date.now()-86400000).toISOString(),samples:0,players:null,guests:null,accounts:null,rooms:null,peak:null,joins:null,completed:null}]}}));
  await page.route('**/admin/v1/telemetry?**',async route=>{
    calls++;
    if(delayed) await new Promise<void>(resolve=>{release=resolve;});
    await route.fulfill({json:{observedAt:new Date().toISOString(),bootId:'fixture',revision:'release',protocol:1,uptimeSeconds:60,memoryRssBytes:1000,joinsSinceBoot:joins,roomsCompletedSinceBoot:0,rooms:[],totals:{humans:0,guests:0,accounts:0,bots:0,reservedSeats:0,rooms:0}}});
  });
  await login(page); await expect(page.locator('#refresh')).toBeEnabled();
  await page.getByRole('navigation').getByRole('button',{name:'Traffic & engagement'}).click();
  const heading=page.getByRole('heading',{name:'Connected players over time'});
  await expect(heading).toBeVisible(); const original=await heading.elementHandle();
  joins=2;
  await page.clock.fastForward(15_000);
  await page.getByText('View interval data',{exact:true}).click();
  await expect(page.getByRole('cell',{name:'2',exact:true})).toBeVisible();
  expect(await original!.evaluate(el=>el.isConnected)).toBe(true);
  await expect(page.locator('#refresh')).toBeEnabled();
  const previous=calls; delayed=true;
  await page.clock.fastForward(15_000); await expect.poll(()=>calls).toBe(previous+1);
  await expect(heading).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Architecture'}).click();
  release(); delayed=false;
  await expect(page.locator('#refresh')).toBeEnabled();
  await expect(page.locator('.architecture')).toBeVisible();
  await expect(heading).toHaveCount(0);
});
