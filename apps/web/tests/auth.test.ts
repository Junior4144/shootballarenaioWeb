import test from 'node:test';
import assert from 'node:assert/strict';
import { clearResumeTokens } from '../src/network/PracticeConnection';
import { callbackError } from '../src/auth/AccountScreen';
test('Google denial and callback failures are safe, fixed text', () => {
  assert.match(callbackError(new URL('https://arena.test/?error=access_denied&error_description=secret'))!, /cancelled/);
  assert.match(callbackError(new URL('https://arena.test/#error=server_error&error_description=<script>'))!, /failed or expired/);
  assert.equal(callbackError(new URL('https://arena.test/')), undefined);
});
test('identity changes clear every arena resume token and preserve unrelated storage', () => {
  const values = new Map([['shootball:v7:server:guest', 'guest-token'], ['shootball:v7:server:account:a', 'a-token'], ['theme', 'dark']]);
  const storage: Storage = { get length() { return values.size; }, key: (i: number) => [...values.keys()][i], removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear(), getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  clearResumeTokens(storage);
  assert.deepEqual([...values], [['theme', 'dark']]);
  assert.doesNotThrow(() => clearResumeTokens());
});
