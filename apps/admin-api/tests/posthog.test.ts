import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { posthogHistory, parsePosthogRows, posthogReader, posthogQuery } from '../src/posthog';
import { createAdminServer } from '../src/server';
import { FixtureInventory } from '../src/inventory';

test('PostHog buckets preserve period-wide uniques, UTC alignment, and missing game values', () => {
  const end = Date.UTC(2026,9,7,12) / 1000;
  const data = posthogHistory('1h','development',end,[[-1,9,1,1],[-2,4,2,2],[60,4,1,1],[61,5,1,1]],end*1000);
  assert.equal(data.current.length,60); assert.equal(data.previous.length,60);
  assert.equal(data.current[0].at,'2026-10-07T11:00:00.000Z');
  assert.equal(data.analytics?.current.visitors,1); // Not the sum of interval uniques.
  assert.equal(data.current[2].views,0); assert.equal(data.current[0].players,null);
  for (const range of ['24h','7d','30d'] as const) assert.ok(posthogHistory(range,'production',end,[],0).current.length<=168);
});

test('CLI results are bounded and validated before reaching the browser', () => {
  assert.deepEqual(parsePosthogRows({results:'slot|views|visitors|sessions\n-1|5|2|3\n60|5|2|3'}),[[-1,5,2,3],[60,5,2,3]]);
  assert.deepEqual(parsePosthogRows({results:'slot|views|visitors|sessions\n-1.0|5|2|3'}),[[-1,5,2,3]]);
  for (const results of ['error','slot|views|visitors|sessions\n1|NaN|2|3','slot|views|visitors|sessions\n1|-1|2|3']) assert.throws(()=>parsePosthogRows({results}));
  assert.throws(()=>posthogHistory('1h','production',0,[[120,1,1,1]],0));
  assert.ok(posthogQuery('30d','production',10000000).includes('shootball-arena.vercel.app'));
});

test('PostHog cache coalesces reads, separates scope and ages out stale results', async () => {
  let now=10000000,calls=0,fail=false;
  const reader=posthogReader(async(tool)=>{
    calls++; if(fail)throw new Error('secret credential should never escape');
    return tool==='project-get'?{id:651980,name:'ShootBallArena'}:{results:'slot|views|visitors|sessions\n-1|3|1|1'};
  },()=>now);
  const [a,b]=await Promise.all([reader('24h','production'),reader('24h','production')]);
  assert.equal(a,b);assert.equal(calls,2);
  await reader('24h','production');assert.equal(calls,2);
  await reader('24h','development');assert.equal(calls,3);
  now+=61000;fail=true;
  const stale=await reader('24h','production');assert.equal(stale.analytics?.stale,true);assert.equal(stale.generatedAt,a.generatedAt);
  now+=16*60000;await assert.rejects(reader('24h','production'),/^Error: PostHog unavailable$/);
  const wrong=posthogReader(async()=>({id:2,name:'other'}));await assert.rejects(wrong('1h','production'));
});

test('PostHog route checks admin access before every cached read and validates scope',async()=>{
  let allowed=false,calls=0;
  const server=createAdminServer({inventory:new FixtureInventory(),allowedHosts:[],allowedOrigins:[],
    authorize:async()=>allowed?{status:'allowed',userId:'admin',roles:['viewer'],environment:'production'}:{status:'denied'},
    readPosthog:async(range,scope)=>{calls++;return posthogHistory(range,scope,0,[],0);}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+(server.address() as {port:number}).port+'/admin/v1/traffic?environment=production&source=posthog';
  const headers={Authorization:'Bearer test'};
  try {
    assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers})).status,403);assert.equal(calls,0);
    allowed=true;
    assert.equal((await fetch(url+'&scope=invalid',{headers})).status,400);
    assert.equal((await fetch(url+'&scope=development',{headers})).status,200);assert.equal(calls,1);
    allowed=false;assert.equal((await fetch(url,{headers})).status,403);assert.equal(calls,1);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
