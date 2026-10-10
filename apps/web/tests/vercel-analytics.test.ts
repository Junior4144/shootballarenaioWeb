import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicPageview } from '../src/vercel-analytics';

test('Vercel page views strip OAuth codes, recovery parameters and token fragments', () => {
  assert.deepEqual(publicPageview({ type: 'pageview', url: 'https://www.orb-skirmish.com/?code=secret&recovery=1#access_token=secret' }),
    { type: 'pageview', url: 'https://www.orb-skirmish.com/' });
});

test('Vercel analytics excludes administration, non-production origins and custom events', () => {
  for (const url of ['https://www.orb-skirmish.com/admin', 'https://www.orb-skirmish.com/admin/users',
    'http://localhost:5173/', 'https://preview.vercel.app/',
    'https://shootball-control-test-730016272076.us-central1.run.app/',
    'https://www.orb-skirmish.com.attacker.example/', 'invalid']) {
    assert.equal(publicPageview({ type: 'pageview', url }), null);
  }
  assert.equal(publicPageview({ type: 'event', url: 'https://www.orb-skirmish.com/' }), null);
});
