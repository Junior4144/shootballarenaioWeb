/** Opt-in integration test: creates only uniquely named disposable users, then deletes them. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@colyseus/sdk';
import type { AddressInfo } from 'node:net';
import { verifyAccount, PROJECT_URL } from '../apps/game-server/src/accountAuth';
import { createServer } from '../apps/game-server/src/server';
import { ROOM_NAME, VERSION, type Snapshot } from '../packages/protocol/src/index';

assert.equal(process.env.SUPABASE_URL, PROJECT_URL, 'Wrong project');
assert.ok(process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY, 'Set hosted test keys in the untracked root .env');
const options = { auth: { flowType: 'pkce' as const, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(PROJECT_URL, process.env.SUPABASE_SECRET_KEY!, options);
const a = createClient(PROJECT_URL, process.env.SUPABASE_PUBLISHABLE_KEY!, options);
const b = createClient(PROJECT_URL, process.env.SUPABASE_PUBLISHABLE_KEY!, options);
const anon = createClient(PROJECT_URL, process.env.SUPABASE_PUBLISHABLE_KEY!, options);
const ids: string[] = [];
const password = `Test-${randomUUID()}-aA9!`;
const email = `arena-auth-test-${randomUUID()}@example.com`;
const server = createServer();
let listening = false;
try {
  const signup = await a.auth.signUp({ email, password });
  assert.ifError(signup.error); assert.ok(signup.data.user); ids.push(signup.data.user.id);
  assert.ok(signup.data.session, 'Signup must return a session without email verification');
  await a.auth.signOut({ scope: 'local' });
  const login = await a.auth.signInWithPassword({ email, password }); assert.ifError(login.error);
  assert.ok(login.data.session);
  const created = await admin.auth.admin.createUser({ email: `arena-auth-test-${randomUUID()}@example.com`, password, email_confirm: true });
  assert.ifError(created.error); ids.push(created.data.user!.id);
  assert.ifError((await b.auth.signInWithPassword({ email: created.data.user!.email!, password })).error);
  assert.ifError((await a.from('profiles').insert({ id: ids[0], display_name: 'Pixel Test' })).error);
  assert.ifError((await b.from('profiles').insert({ id: ids[1], display_name: 'Other Test' })).error);
  assert.equal((await a.from('profiles').select('*')).data?.length, 1);
  assert.deepEqual((await a.from('profiles').select('*').eq('id', ids[1])).data, []);
  assert.deepEqual((await a.from('profiles').update({ display_name: 'Hijacked' }).eq('id', ids[1]).select()).data, []);
  assert.ok((await a.from('profiles').insert({ id: ids[1], display_name: 'Hijacked' })).error);
  assert.ok((await a.from('profiles').update({ id: ids[1] }).eq('id', ids[0])).error);
  assert.ok((await a.from('profiles').update({ display_name: 'private@email.com' }).eq('id', ids[0])).error);
  assert.ifError((await a.from('profiles').update({ display_name: 'Pixel Updated' }).eq('id', ids[0]).select().single()).error);
  assert.ok((await anon.from('profiles').select('*')).error);
  const verified = await verifyAccount(login.data.session.access_token);
  assert.equal(verified.userId, ids[0]); assert.equal(verified.displayName, 'Pixel Updated');
  await assert.rejects(verifyAccount('invalid.token.value'));
  if (!process.env.ARENA_TEST_ENDPOINT) { await server.listen(0, '127.0.0.1'); listening = true; }
  const client = new Client(process.env.ARENA_TEST_ENDPOINT ?? `ws://127.0.0.1:${(server.transport.server!.address() as AddressInfo).port}`);
  const room = await client.joinOrCreate(ROOM_NAME, { version: VERSION, mode: 'account', accessToken: login.data.session.access_token, userId: ids[1] });
  room.reconnection.enabled = false;
  try {
    const snapshot = await new Promise<Snapshot>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Snapshot timeout')), 4000);
      room.onMessage<Snapshot>('snapshot', value => { clearTimeout(timer); resolve(value); });
    });
    assert.deepEqual(snapshot.identities?.[room.sessionId], { kind: 'account', displayName: 'Pixel Updated' });
    const wire = JSON.stringify(snapshot);
    for (const privateValue of [email, ...ids, login.data.session.access_token, login.data.session.refresh_token]) assert.equal(wire.includes(privateValue), false);
    const refreshed = await a.auth.refreshSession(); assert.ifError(refreshed.error);
    room.send('refreshAuth', refreshed.data.session!.access_token);
    await new Promise(resolve => setTimeout(resolve, 500)); assert.equal(room.connection.isOpen, true);
  } finally { if (room.connection.isOpen) await room.leave(); }
  assert.ifError((await a.auth.signOut({ scope: 'local' })).error);
  assert.equal((await a.auth.getSession()).data.session, null);
  console.log('PASS: hosted signup without email verification, password login, profiles/RLS, server verification, snapshot privacy, refresh, and logout.');
} finally {
  if (listening) await server.gracefullyShutdown(false);
  await Promise.allSettled([a.auth.signOut({ scope: 'local' }), b.auth.signOut({ scope: 'local' })]);
  for (const id of ids) { const result = await admin.auth.admin.deleteUser(id); assert.ifError(result.error); }
  console.log(`Cleaned up ${ids.length} disposable auth users and their profiles.`);
}
