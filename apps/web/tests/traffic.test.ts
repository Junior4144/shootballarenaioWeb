import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { websiteVisit } from '../src/traffic';
test('page loads have unique event IDs while tab sessions survive reload and expire after inactivity',()=>{
  let stored:string|null=null;
  const storage={getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value;}};
  const first=websiteVisit(storage,1000,randomUUID),second=websiteVisit(storage,2000,randomUUID);
  assert.notEqual(first.p_event,second.p_event);assert.equal(first.p_session,second.p_session);
  const expired=websiteVisit(storage,2000+31*60_000,randomUUID);assert.notEqual(expired.p_session,second.p_session);
  assert.deepEqual(Object.keys(first),['p_event','p_session']);
});
test('analytics tolerates invalid or unavailable session storage',()=>{
  const bad={getItem:()=>'{bad',setItem:()=>{throw new Error('disabled');}};
  assert.match(websiteVisit(bad,1000,randomUUID).p_session,/^[a-f0-9-]{36}$/);
});
