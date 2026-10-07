import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseInputs } from '../check-release-inputs.mjs';
import { manifestFromInspect, validateManifest } from '../release-digests.mjs';
import { PRIMARY_WEB, ORIGIN_WEB, GAME_URL, verifyWebRelease, verifyGameRelease } from '../release-checks.mjs';
const sha = 'a'.repeat(40), digest = 'sha256:' + 'b'.repeat(64);
const registry = 'us-central1-docker.pkg.dev/project-7915787f-37b2-4286-aa7/shootball-test';
test('release gate rejects wrong branch, budget, project and non-primary website', () => {
  const env = { GITHUB_REF:'refs/heads/main', GCP_DEPLOY_ENABLED:'true', PUBLIC_KEY:'sb_publishable_fixture', GAME_URL, WEB_BASE_URL:PRIMARY_WEB };
  const policy = { project:'project-7915787f-37b2-4286-aa7', region:'us-central1', repository:'shootball-test', deploymentEnabled:true, monthlyTargetUsd:12 };
  validateReleaseInputs(env,policy);
  for (const override of [{GITHUB_REF:'refs/heads/dev'}, {GCP_DEPLOY_ENABLED:'false'}, {WEB_BASE_URL:ORIGIN_WEB}, {GAME_URL:'wss://other.example'}, {PUBLIC_KEY:''}]) assert.throws(()=>validateReleaseInputs({...env,...override},policy));
  for (const override of [{monthlyTargetUsd:13},{monthlyTargetUsd:null},{monthlyTargetUsd:-1},{project:'other'},{deploymentEnabled:false}]) assert.throws(()=>validateReleaseInputs(env,{...policy,...override}));
});
test('published digest must belong to the tested tag and scoped repository', () => {
  const image='game-server', repository=registry+'/'+image;
  const inspect=[{RepoTags:[repository+':'+sha],RepoDigests:[repository+'@'+digest]}];
  const manifest=manifestFromInspect(inspect,image,sha);
  assert.equal(validateManifest(manifest,image,sha),digest);
  assert.throws(()=>manifestFromInspect([{...inspect[0],RepoTags:[repository+':old']}],image,sha));
  assert.throws(()=>manifestFromInspect([{...inspect[0],RepoDigests:['other.example/game@'+digest]}],image,sha));
  assert.throws(()=>validateManifest({...manifest,sha:'c'.repeat(40)},image,sha));
  assert.throws(()=>validateManifest({...manifest,digest:'latest'},image,sha));
  assert.throws(()=>validateManifest({...manifest,image:'control-plane'},image,sha));
});
function fixture({ revisions=[sha,sha,sha], adminStatus=401, project='lkgxpgcmspxekggndzih', configMode='supabase' }={}) {
  let now=0, healthCalls=0; const urls=[];
  return {
    get healthCalls(){return healthCalls;}, urls,
    options:{
      now:()=>now,sleep:async ms=>{now+=ms;},timeoutMs:100000,
      request:async (url,options)=>{
        const u=new URL(url); urls.push(u.href);
        if(u.pathname==='/health') { const revision=revisions[Math.min(healthCalls++,revisions.length-1)];if(revision===null)throw new Error('temporary outage');return Response.json({status:'live',revision}); }
        if(u.pathname==='/admin/config')return Response.json({mode:configMode,environment:'production',supabaseUrl:'https://'+project+'.supabase.co',publishableKey:'sb_publishable_fixture'});
        if(u.pathname.startsWith('/admin/v1/')) {
          if(u.pathname.endsWith('/session'))assert.equal(options.headers.Origin,u.origin);
          return Response.json({error:'Sign in required'},{status:adminStatus,headers:{'Cache-Control':'no-store'}});
        }
        return new Response('public page',{status:200});
      }
    }
  };
}
test('both website routes require stable matching revisions and protect every admin data route',async()=>{
  for (const base of [PRIMARY_WEB,ORIGIN_WEB]) {
    const f=fixture({revisions:[sha,'old',sha,null,sha,sha,sha]});
    await verifyWebRelease(base,sha,f.options);assert.equal(f.healthCalls,7);
    for(const route of ['accounts','activity','memberships','telemetry','health','dashboard']) assert(f.urls.includes(base+'/admin/v1/'+route+'?environment=production'));
    assert(f.urls.includes(base+'/admin'));assert(f.urls.includes(base+'/admin/'));
  }
});
test('an outdated release, origin rejection, exposed data or wrong auth project fails deployment verification',async()=>{
  const stale=fixture({revisions:['old']});stale.options.timeoutMs=15000;
  await assert.rejects(verifyWebRelease(PRIMARY_WEB,sha,stale.options),/did not stabilize/);
  for(const settings of [{adminStatus:200},{adminStatus:403},{project:'other'},{configMode:'local'}]) await assert.rejects(verifyWebRelease(PRIMARY_WEB,sha,fixture(settings).options));
});
test('game verification checks the deployed commit and denies public telemetry',async()=>{
  let calls=0;
  const request=async url=>{calls++;return url.endsWith('/healthz')?Response.json({status:'live',revision:sha}):new Response('',{status:401});};
  await verifyGameRelease(GAME_URL,sha,request);assert.equal(calls,2);
  await assert.rejects(verifyGameRelease(GAME_URL,'c'.repeat(40),request));
  await assert.rejects(verifyGameRelease('wss://other.example',sha,request));
});
