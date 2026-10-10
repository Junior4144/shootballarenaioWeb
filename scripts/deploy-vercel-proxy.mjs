import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error('VERCEL_TOKEN is required; use an authorized Vercel login');
const team = 'team_wcBcg21IdtA6TZyO0dRea5Di';
const project = 'prj_zml6Wx0SyKQ2315FK7OOmhhGWDmW';
const api = async (path, body) => {
  const response = await fetch('https://api.vercel.com' + path + '?teamId=' + team, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error('Vercel ' + response.status + ': ' + (result.error?.message ?? 'request failed'));
  return result;
};
const config = await readFile(new URL('../deploy/vercel/vercel.json', import.meta.url), 'utf8');
const favicon = await readFile(new URL('../deploy/vercel/favicon.ico', import.meta.url));
const deployment = await api('/v13/deployments', {
  name: 'shootball-arena', project, target: 'production',
  projectSettings: { framework: null, buildCommand: '', installCommand: '', outputDirectory: null },
  files: [{ file: 'vercel.json', data: config }, { file: 'favicon.ico', data: favicon.toString('base64'), encoding: 'base64' }, { file: 'index.html', data: '<!doctype html><title>Shootball proxy</title>' }],
});
console.log('Deploying proxy:', deployment.id);
const deadline = Date.now() + 180000;
while (Date.now() < deadline) {
  const result = await api('/v13/deployments/' + deployment.id);
  if (result.readyState === 'ERROR' || result.readyState === 'CANCELED') throw new Error('Proxy deployment ' + result.readyState);
  if (result.readyState === 'READY' && result.aliasAssigned) { console.log('Proxy ready: https://www.orb-skirmish.com'); process.exit(0); }
  await delay(3000);
}
throw new Error('Proxy deployment did not finish within three minutes');
