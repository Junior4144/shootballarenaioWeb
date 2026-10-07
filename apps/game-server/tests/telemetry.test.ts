import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { ROOM_NAME, VERSION } from '@shootball/protocol';
import { createServer } from '../src/server';
test('telemetry requires current admin access and counts real guest rooms without identity leaks',async()=>{
  let allowed=false;
  const server=createServer({bots:true},undefined,async token=>allowed && token==='test-admin');
  await server.listen(0,'127.0.0.1'); const port=(server.transport.server!.address() as {port:number}).port;
  const url='http://127.0.0.1:'+port+'/ops/telemetry';const headers={Authorization:'Bearer test-admin'};
  let room: Awaited<ReturnType<Client['joinOrCreate']>> | undefined;
  try {
    assert.equal((await fetch(url)).status,401); assert.equal((await fetch(url,{headers})).status,403);
    allowed=true; const empty=await (await fetch(url,{headers})).json();assert.equal(empty.totals.humans,0);
    room=await new Client('ws://127.0.0.1:'+port).joinOrCreate(ROOM_NAME,{version:VERSION,mode:'guest'});room.onMessage('snapshot',()=>{});room.reconnection.enabled=false;
    const response=await fetch(url,{headers});const data=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(data.totals.humans,1);assert.equal(data.totals.guests,1);assert.equal(data.totals.accounts,0);assert.equal(data.totals.bots,7);assert.equal(data.rooms.length,1);assert.equal(data.joinsSinceBoot,1);
    assert.equal(data.rooms[0].id,room.roomId);assert.ok(!JSON.stringify(data).includes(room.sessionId));assert.ok(!JSON.stringify(data).includes('test-admin'));
    const reconnectToken=room.reconnectionToken;
    room.connection.close();
    let disconnected;
    for(let attempt=0;attempt<20;attempt++) { await new Promise(resolve=>setTimeout(resolve,20));disconnected=await (await fetch(url,{headers})).json();if(disconnected.totals.reservedSeats===1)break; }
    assert.equal(disconnected.totals.humans,0);assert.equal(disconnected.totals.reservedSeats,1);
    room=await new Client('ws://127.0.0.1:'+port).reconnect(reconnectToken);room.onMessage('snapshot',()=>{});room.reconnection.enabled=false;
    const reconnected=await (await fetch(url,{headers})).json();assert.equal(reconnected.totals.humans,1);assert.equal(reconnected.totals.reservedSeats,0);assert.equal(reconnected.joinsSinceBoot,1);
    await room.leave();room=undefined;
    let disposed;
    for(let attempt=0;attempt<20;attempt++) { await new Promise(resolve=>setTimeout(resolve,20));disposed=await (await fetch(url,{headers})).json();if(disposed.rooms.length===0)break; }
    assert.equal(disposed.rooms.length,0);
    allowed=false;assert.equal((await fetch(url,{headers})).status,403);
  } finally { if(room) await room.leave();await server.gracefullyShutdown(false); }
});
