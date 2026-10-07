import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Telemetry } from '../src/telemetry';
import { startTrafficCollector, trafficSample } from '../src/traffic';
test('history samples contain aggregates only, excluding room and user identifiers',()=>{
  const telemetry=new Telemetry();
  const sample=trafficSample(telemetry.snapshot());
  assert.equal(sample.players,0); assert.equal(sample.joins,0);
  assert.deepEqual(Object.keys(sample),['at','bootId','players','guests','accounts','rooms','joins','completed','uptime']);
});
test('collector does not overlap writes, tolerates outages, skips candidates and stops cleanly',async()=>{
  let active=false,calls=0,errors=0;
  let release:()=>void=()=>{};
  const stop=startTrafficCollector(()=>new Telemetry().snapshot(),{intervalMs:10,active:async()=>active,
    write:async()=>{calls++;if(calls===1){await new Promise<void>(resolve=>release=resolve);throw new Error('offline');}},onError:()=>{errors++;}});
  try {
    await new Promise(r=>setTimeout(r,25));assert.equal(calls,0);
    active=true;await new Promise(r=>setTimeout(r,35));assert.equal(calls,1);
    release();await new Promise(r=>setTimeout(r,35));assert.equal(errors,1);assert.ok(calls>1);
    stop();const before=calls;await new Promise(r=>setTimeout(r,25));assert.equal(calls,before);
  } finally {release();stop();}
});
