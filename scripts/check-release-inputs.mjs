import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function validateReleaseInputs(env, policy) {
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Only main may publish release images');
  assert.equal(env.GCP_DEPLOY_ENABLED, 'true', 'Deployment is disabled');
  assert.equal(policy.project, 'project-7915787f-37b2-4286-aa7');
  assert.equal(policy.region, 'us-central1');
  assert.equal(policy.repository, 'shootball-test');
  assert.equal(policy.deploymentEnabled, true, 'Cost gate closed');
  assert(Number.isFinite(policy.monthlyTargetUsd) && policy.monthlyTargetUsd > 0 && policy.monthlyTargetUsd < 13, 'Cost gate closed');
  assert.match(env.PUBLIC_KEY ?? '', /^sb_publishable_[A-Za-z0-9_-]+$/, 'Publishable key required');
  assert.equal(env.GAME_URL, 'wss://136.71.64.19.sslip.io', 'Unexpected game endpoint');
  assert.equal(env.WEB_BASE_URL, 'https://www.orb-skirmish.com', 'Orb-skirmish must be the primary website');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateReleaseInputs(process.env, JSON.parse(readFileSync(new URL('../deploy/gcp/test-policy.json', import.meta.url), 'utf8')));
  console.log('Main release inputs and cost policy verified');
}
