import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAdminServer } from '../src/server';
import { FixtureInventory } from '../src/inventory';
import { trafficSummary } from '@shootball/admin-contracts';
test('traffic API enforces membership, range and source before accessing history',async()=>{
  let allowed=false,calls=0;
  const server=createAdminServer({inventory:new FixtureInventory(),allowedHosts:[],allowedOrigins:[],authorize:async()=>allowed?{status:'allowed',userId:'admin',roles:['viewer'],environment:'production'}:{status:'denied'},
    readTraffic:async(token,range,source)=>{calls++;assert.equal(token,'test');return {source,range,current:[],previous:[],bucketSeconds:60,generatedAt:new Date().toISOString(),latestSampleAt:null,retentionDays:62};}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/admin/v1/traffic?environment=production';const headers={Authorization:'Bearer test'};
  try {
    assert.equal((await fetch(base)).status,401);assert.equal((await fetch(base,{headers})).status,403);assert.equal(calls,0);allowed=true;
    for(const query of ['&range=all','&range=__proto__','&source=unknown'])assert.equal((await fetch(base+query,{headers})).status,400);
    const body=await(await fetch(base+'&range=7d&source=website',{headers})).json();assert.equal(body.range,'7d');assert.equal(body.source,'website');assert.equal(calls,1);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('traffic summaries weight sampled averages and keep absent measurements unknown',()=>{
  const a={at:'2026-10-07',samples:1,players:10,guests:10,accounts:0,rooms:1,peak:10,joins:null,completed:null};
  const b={...a,samples:3,players:2,peak:4,joins:0};
  assert.equal(trafficSummary([a,b],900).average,4);
  assert.equal(trafficSummary([a,b],900).peak,10);
  assert.equal(trafficSummary([],60).average,null);
  assert.equal(trafficSummary([a],60).joins,null);
});
