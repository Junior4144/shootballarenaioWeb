import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Project-scoped tokens can deploy but cannot read /user, which the CLI requires.
// Called by the scoped wrapper when VERCEL_TOKEN is supplied.
const root = new URL('../deploy/vercel/', import.meta.url);
const scope = JSON.parse(await readFile(new URL('../deploy/vercel-project.json', import.meta.url), 'utf8'));
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error('VERCEL_TOKEN required');
const options = process.argv.slice(2);
if (options.some(value => !['--prod', '--yes'].includes(value))) throw new Error('Unsupported deployment option');
const api = async (path, body) => {
  const response = await fetch('https://api.vercel.com' + path + '?teamId=' + scope.orgId, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error('Vercel ' + response.status + ': ' + (result.error?.message ?? 'Request failed'));
  return result;
};
const project = await api('/v9/projects/' + scope.projectId);
if (project.id !== scope.projectId || project.accountId !== scope.orgId) throw new Error('Vercel scope mismatch');
const release = JSON.parse(await readFile(new URL('public/release.json', root), 'utf8'));
if (release.hosting !== 'vercel-static' || !/^[a-f0-9]{40}$/.test(release.revision)) throw new Error('Prepared frontend release required');
const files = [{ file: 'vercel.json', data: await readFile(new URL('vercel.json', root), 'utf8') }];
async function collect(relative) {
  for (const entry of await readdir(new URL(relative + '/', root), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) throw new Error('Unexpected hidden file or symlink');
    const path = relative + '/' + entry.name;
    if (entry.isDirectory()) await collect(path);
    else files.push({ file: path, data: (await readFile(new URL(path, root))).toString('base64'), encoding: 'base64' });
  }
}
await collect('public');
const deployment = await api('/v13/deployments', {
  name: scope.projectName, project: scope.projectId,
  ...(options.includes('--prod') ? { target: 'production' } : {}),
  projectSettings: { framework: null, buildCommand: '', installCommand: '', outputDirectory: 'public' },
  meta: { frontendRevision: release.revision }, files,
});
console.log('Deploying static frontend:', deployment.id);
const deadline = Date.now() + 180000;
while (Date.now() < deadline) {
  const result = await api('/v13/deployments/' + deployment.id);
  if (['ERROR', 'CANCELED'].includes(result.readyState)) throw new Error('Deployment ' + result.readyState);
  if (result.readyState === 'READY' && (!options.includes('--prod') || result.aliasAssigned)) {
    console.log('Static frontend ready:', 'https://' + result.url, release.revision);
    process.exit(0);
  }
  await delay(3000);
}
throw new Error('Static deployment did not finish within three minutes');
