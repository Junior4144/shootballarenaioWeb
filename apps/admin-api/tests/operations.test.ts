import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { HealthMonitor } from '../src/health';
import { LINKS, parseGameTelemetry } from '@shootball/admin-contracts';
import { createAdminServer } from '../src/server';
import { FixtureInventory } from '../src/inventory';
import { CONFIG } from '../../../packages/shared/src/config';
import { configDiff, validateConfigDocument } from '../../../packages/shared/src/config-document';
test('health probes fixed destinations, deduplicates reads and reports failure without stale success', async () => {
  let now=1000, fail=false; const urls:string[]=[];
  const monitor=new HealthMonitor((async (url: string) => { urls.push(url); if(fail) throw new Error('private'); return Response.json({status:'live',revision:'release-1'}); }) as typeof fetch,()=>now);
  assert.deepEqual(await monitor.read('local'),[]); assert.equal(urls.length,0);
  const [a,b]=await Promise.all([monitor.read('production'),monitor.read('production')]);
  assert.deepEqual(a,b); assert.equal(urls.length,3); assert.deepEqual(urls,[LINKS.primary+'/health',LINKS.origin+'/health',LINKS.game+'/healthz']);
  assert.ok(a.every(c=>c.status==='healthy'));
  fail=true; now+=61_000;
  const failed=await monitor.read('production'); assert.ok(failed.every(c=>c.status==='unavailable' && c.revision===null)); assert.ok(!JSON.stringify(failed).includes('private'));
});
test('untrusted configuration rejects missing fields, type confusion, extra keys and unsafe values',()=>{
  assert.deepEqual(validateConfigDocument(CONFIG),[]);
  for(const input of [null,[],{}, {...CONFIG,player:null},{...CONFIG,extra:true},JSON.parse('{"__proto__":{}}')]) assert.ok(validateConfigDocument(input).length);
  let draft=structuredClone(CONFIG); draft.network.tickMs=0; assert.ok(validateConfigDocument(draft).length);
  draft=structuredClone(CONFIG); draft.server.port=9999; assert.ok(validateConfigDocument(draft).some(e=>e.includes('deployment-only')));
  draft=structuredClone(CONFIG); draft.map.walls[0].width=-1; assert.ok(validateConfigDocument(draft).length);
  draft=structuredClone(CONFIG); draft.player.speed=250; assert.deepEqual(validateConfigDocument(draft),[]); assert.deepEqual(configDiff(CONFIG,draft),[{path:'player.speed',before:220,after:250}]);
});
test('new API reads enforce membership before adapters and validate record pagination',async()=>{
  let allowed=false, calls=0;
  const server=createAdminServer({inventory:new FixtureInventory(),allowedHosts:[],allowedOrigins:[],authorize:async()=>allowed?{status:'allowed',userId:'admin',roles:['viewer'],environment:'production'}:{status:'denied'},readRecords:async(token,view,search,offset)=>{calls++;assert.equal(token,'test');return {rows:[{view,search}],offset,limit:50,hasMore:false,source:'fixture'};},telemetryFetch:(async(url:string,init:RequestInit)=>{calls++;assert.equal(url,LINKS.game+'/ops/telemetry');assert.equal((init.headers as Record<string,string>).Authorization,'Bearer test');assert.equal(init.redirect,'error');return Response.json({rooms:[],totals:{humans:0,guests:0,accounts:0,bots:0,reservedSeats:0,rooms:0},bootId:'boot',observedAt:new Date().toISOString(),revision:'test',protocol:1,uptimeSeconds:1,memoryRssBytes:100,joinsSinceBoot:0,roomsCompletedSinceBoot:0,privateToken:'must-not-forward'});}) as typeof fetch});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/admin/v1/'; const headers={Authorization:'Bearer test'};
  try {
    for(const route of ['accounts','activity','memberships','health','telemetry']) { assert.equal((await fetch(base+route+'?environment=production')).status,401);assert.equal((await fetch(base+route+'?environment=production',{headers})).status,403); }
    assert.equal(calls,0);allowed=true;
    assert.equal((await fetch(base+'accounts?environment=production&offset=-1',{headers})).status,400);
    assert.equal((await fetch(base+'accounts?environment=production&offset=1.5',{headers})).status,400);
    const page=await (await fetch(base+'accounts?environment=production&search=guest&offset=50',{headers})).json();assert.equal(page.offset,50);assert.equal(page.rows[0].search,'guest');
    const telemetryResponse=await fetch(base+'telemetry?environment=production',{headers});assert.equal(telemetryResponse.status,200);assert.ok(!(await telemetryResponse.text()).includes('must-not-forward'));
    assert.throws(()=>parseGameTelemetry({rooms:[],totals:{}}));
    allowed=false;assert.equal((await fetch(base+'accounts?environment=production',{headers})).status,403);assert.equal(calls,2);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
