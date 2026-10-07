import { test, expect } from '@playwright/test';
import { posthogHistory } from '../../admin-api/src/posthog';

test('PostHog charts switch scope and range, preserve refresh state and use deduplicated totals', async ({page}, info) => {
  let stale=false;
  const queries:string[]=[];
  await page.route('**/admin/v1/traffic?**',route=>{
    const url=new URL(route.request().url());queries.push(url.search);
    if(url.searchParams.get('source')!=='posthog')return route.fulfill({status:503,json:{error:'No game history'}});
    const range=url.searchParams.get('range') as '24h'|'7d';
    const scope=url.searchParams.get('scope') as 'production'|'development';
    const data=posthogHistory(range,scope,Date.UTC(2026,9,7,12)/1000,[[-1,8,1,1],[-2,3,1,1],[96,4,1,1],[97,4,1,1]],Date.UTC(2026,9,7,12));
    data.analytics!.stale=stale;
    return route.fulfill({json:data});
  });
  await page.route('**/admin/v1/telemetry?**',r=>r.fulfill({status:503,json:{error:'offline'}}));
  await page.goto('/');await page.getByLabel('Local session token').fill('local-browser-test-token-not-a-hosted-credential');
  await page.getByRole('button',{name:'Open control room'}).click();
  await expect(page.getByRole('heading',{name:'Registered servers'})).toBeVisible();
  await page.getByRole('navigation').getByRole('button',{name:'Traffic & engagement'}).click();
  await page.getByRole('button',{name:'PostHog analytics',exact:true}).click();
  await expect(page.locator('.traffic-metrics article').nth(1).locator('strong')).toHaveText('1');
  await expect(page.getByRole('link',{name:'Explore in PostHog'})).toHaveAttribute('href','https://us.posthog.com/project/651980/web');
  await page.getByRole('button',{name:'Development',exact:true}).click();
  await expect.poll(()=>queries.some(q=>q.includes('scope=development'))).toBe(true);
  await page.getByRole('button',{name:'Visitors',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Visitors over time'})).toBeVisible();
  await page.getByLabel('Compare previous period').uncheck();
  await page.getByText('View interval data',{exact:true}).click();
  stale=true;await page.locator('#refresh').click();
  await expect(page.getByText('PostHog refresh failed; showing cached data with its original update time.')).toBeVisible();
  await expect(page.getByLabel('Compare previous period')).not.toBeChecked();
  await expect(page.locator('.traffic-data table')).toBeVisible();
  await expect(page.locator('.traffic-chart path')).toHaveCount(1);
  await page.screenshot({path:info.outputPath('posthog-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:900});
  await page.getByRole('button',{name:'7d',exact:true}).click();
  await expect.poll(()=>queries.some(q=>q.includes('range=7d')&&q.includes('scope=development'))).toBe(true);
  await page.getByRole('button',{name:'Active sessions',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Active sessions over time'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('posthog-mobile.png'),fullPage:true});
});

test('history renders while live telemetry is still pending',async({page})=>{
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>release=resolve);
  await page.route('**/admin/v1/telemetry?**',async r=>{await pending;await r.fulfill({status:503,json:{error:'offline'}});});
  await page.route('**/admin/v1/traffic?**',r=>r.fulfill({json:{source:'game',range:'24h',bucketSeconds:60,retentionDays:62,generatedAt:new Date().toISOString(),latestSampleAt:null,
    current:[{at:new Date().toISOString(),samples:1,players:7,guests:5,accounts:2,rooms:1,peak:7,joins:1,completed:0}],
    previous:[{at:new Date(Date.now()-86400000).toISOString(),samples:1,players:3,guests:2,accounts:1,rooms:1,peak:3,joins:1,completed:0}]}}));
  try {
    await page.goto('/');await page.getByLabel('Local session token').fill('local-browser-test-token-not-a-hosted-credential');await page.getByRole('button',{name:'Open control room'}).click();
    await expect(page.getByRole('heading',{name:'Registered servers'})).toBeVisible();
    await page.getByRole('navigation').getByRole('button',{name:'Traffic & engagement'}).click();
    await expect(page.locator('.traffic-chart')).toBeVisible();
    await expect(page.locator('.traffic-metrics article').nth(1).locator('strong')).toHaveText('7');
  } finally {release();}
});
