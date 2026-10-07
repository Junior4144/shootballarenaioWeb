import { test, expect } from '@playwright/test';
import type { TrafficHistory, TrafficPoint } from '@shootball/admin-contracts';
function history(source='game',range='24h',empty=false):TrafficHistory {
  const points=(previous:boolean):TrafficPoint[]=>Array.from({length:24},(_,i)=>{
    const missing=empty || (i>=9 && i<=11);
    const players=Math.round(8+Math.sin(i/3)*5+(previous?0:4));
    return {at:new Date(Date.UTC(2026,9,7,i)-(previous?86400000:0)).toISOString(),samples:missing?0:15,
      players:missing?null:players,guests:missing?null:players-3,accounts:missing?null:3,rooms:missing?null:2,
      peak:missing?null:players+2,joins:missing?null:players*2,completed:missing?null:1,
      views:missing?null:players*7,sessions:missing?null:players*3};
  });
  return {source:source as 'game'|'website',range:range as '24h',generatedAt:new Date().toISOString(),bucketSeconds:900,current:points(false),previous:points(true),retentionDays:62,latestSampleAt:empty?null:new Date().toISOString()};
}
for (const width of [1440,390]) test('traffic explorer sources, comparisons and interval data at '+width,async({page},info)=>{
  await page.setViewportSize({width,height:1000});
  const requests:string[]=[];
  await page.route('**/admin/v1/traffic?**',route=>{const url=new URL(route.request().url());requests.push(url.search);return route.fulfill({json:history(url.searchParams.get('source')!,url.searchParams.get('range')!)});});
  await page.route('**/admin/v1/telemetry?**',route=>route.fulfill({json:{observedAt:new Date().toISOString(),totals:{humans:12,guests:9,accounts:3,rooms:2,bots:4,reservedSeats:0},joinsSinceBoot:100,roomsCompletedSinceBoot:2,uptimeSeconds:120,memoryRssBytes:1000,bootId:'fixture',revision:'test',protocol:1,rooms:[]}}));
  await page.goto('/');await page.getByLabel('Local session token').fill('local-browser-test-token-not-a-hosted-credential');await page.getByRole('button',{name:'Open control room'}).click();
  await expect(page.getByRole('heading',{name:'Registered servers'})).toBeVisible();
  if(width<700)await page.getByRole('button',{name:'Menu'}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Traffic & engagement'}).click();
  await expect(page.getByRole('heading',{name:'Players right now'})).toBeVisible();
  await expect(page.locator('.traffic-chart path')).toHaveCount(2);
  expect(await page.locator('.traffic-chart path').last().getAttribute('d')).toMatch(/M.*M/);
  await page.getByRole('button',{name:'Guests',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Guests over time'})).toBeVisible();
  await page.getByLabel('Compare previous period').uncheck();await expect(page.locator('.traffic-chart path')).toHaveCount(1);
  await page.getByLabel('Compare previous period').check();
  await page.getByLabel('Inspect interval').fill('5');await expect(page.locator('#traffic-point')).toContainText('Previous');
  await page.getByText('View interval data',{exact:true}).click();await expect(page.locator('.traffic-data table')).toBeVisible();
  await page.screenshot({path:info.outputPath('game-traffic.png'),fullPage:true});
  await page.getByRole('button',{name:'Website traffic',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Page views over time'})).toBeVisible();
  await page.getByRole('button',{name:'7d',exact:true}).click();
  await expect.poll(()=>requests.some(r=>r.includes('source=website')&&r.includes('range=7d'))).toBe(true);
  await page.getByRole('button',{name:'New browser sessions',exact:true}).click();
  await expect(page.getByRole('heading',{name:'New browser sessions over time'})).toBeVisible();
  await page.screenshot({path:info.outputPath('website-traffic.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('traffic history is usable when live telemetry fails and empty history never invents traffic',async({page})=>{
  let empty=true,fail=false;
  await page.route('**/admin/v1/traffic?**',r=>fail?r.fulfill({status:503,json:{error:'offline'}}):r.fulfill({json:history('game','24h',empty)}));
  await page.route('**/admin/v1/telemetry?**',r=>r.fulfill({status:503,json:{error:'offline'}}));
  await page.goto('/');await page.getByLabel('Local session token').fill('local-browser-test-token-not-a-hosted-credential');await page.getByRole('button',{name:'Open control room'}).click();
  await expect(page.getByRole('heading',{name:'Registered servers'})).toBeVisible();await page.getByRole('navigation').getByRole('button',{name:'Traffic & engagement'}).click();
  await expect(page.getByText('No history recorded for this period yet')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Last observed players'})).toBeVisible();
  empty=false;await page.locator('#refresh').click();await expect(page.locator('.traffic-chart')).toBeVisible();
  fail=true;await page.locator('#refresh').click();await expect(page.getByText('History refresh failed; showing the last retrieved history.')).toBeVisible();await expect(page.locator('.traffic-chart')).toBeVisible();
});
