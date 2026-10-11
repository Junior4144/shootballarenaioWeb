import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const scope = JSON.parse(await readFile(new URL('deploy/vercel-project.json', root), 'utf8'));
const cwd = fileURLToPath(new URL('deploy/vercel/', root));
const [command = 'help', ...options] = process.argv.slice(2);
if (command === 'help' || command === '--help') {
  console.log(`Vercel: ${scope.teamSlug}/${scope.projectName} (${scope.domain})
Usage: npm run vercel -- <command>
  whoami             Show the authenticated account
  status             Inspect this project's settings
  link               Link deploy/vercel to the existing project
  domains            Inspect the production domain
  analytics          Read this project's production page views for the last day
  analytics-schema   Inspect available Web Analytics metrics
  deploy [--prod] [--yes]  Deploy prepared static frontend and admin proxy (preview by default)
Team, project, working directory and config cannot be overridden.`);
  process.exit(0);
}
const commands = {
  whoami: ['whoami'],
  status: ['project', 'inspect', scope.projectName],
  link: ['link', '--yes', '--project', scope.projectId],
  domains: ['domains', 'inspect', scope.domain],
  analytics: ['metrics', 'vercel.analytics.page_view.count', '--since', '1d', '--granularity', '1h', '--project', scope.projectId, '--prod'],
  'analytics-schema': ['metrics', 'schema', 'vercel.analytics'],
  deploy: ['deploy'],
  'check-preview': ['curl', '/', '--deployment', process.env.VERCEL_PREVIEW_URL ?? ''],
};
if (command === 'check-preview' && !/^https:\/\/shootball-arena-[a-z0-9]+-jrxsoftware\.vercel\.app$/.test(process.env.VERCEL_PREVIEW_URL ?? '')) throw new Error('Set VERCEL_PREVIEW_URL to this project preview');
if (!Object.hasOwn(commands, command)) throw new Error('Unsupported command; run npm run vercel -- help');
if (options.some(option => command !== 'deploy' || !['--prod', '--yes'].includes(option))) {
  throw new Error('Scope overrides and arbitrary deployment paths are not supported');
}
for (const path of ['.vercel/project.json', 'deploy/vercel/.vercel/project.json']) {
  let linked;
  try { linked = JSON.parse(await readFile(new URL(path, root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (linked.orgId !== scope.orgId || linked.projectId !== scope.projectId) {
    throw new Error(`${path} is linked to a different Vercel project; refusing to proceed`);
  }
}
// curl forwards unknown flags to system curl; cwd and scope are already pinned
// by the child process and project environment for this read-only preview probe.
const args = command === 'check-preview' ? [...commands[command]] : ['--scope', scope.orgId, '--cwd', cwd, ...commands[command], ...options];
if (command === 'deploy') {
  const release = JSON.parse(await readFile(new URL('deploy/vercel/public/release.json', root), 'utf8'));
  if (release.hosting !== 'vercel-static' || !/^[a-f0-9]{40}$/.test(release.revision)) throw new Error('Prepare the static frontend before deploying');
  args.push('--local-config', fileURLToPath(new URL('deploy/vercel/vercel.json', root)));
  if (process.env.VERCEL_TOKEN) args.push('--token', process.env.VERCEL_TOKEN);
}
const env = { ...process.env, VERCEL_ORG_ID: scope.orgId, VERCEL_PROJECT_ID: scope.projectId };
// With IDs in the environment, `link` skips writing .vercel/project.json.
// This command already pins the project with --project and the team with --scope.
if (command === 'link') { delete env.VERCEL_ORG_ID; delete env.VERCEL_PROJECT_ID; }
const invocation = command === 'deploy' && env.VERCEL_TOKEN
  ? [fileURLToPath(new URL('scripts/deploy-vercel-static-api.mjs', root)), ...options]
  : [fileURLToPath(new URL('node_modules/vercel/dist/index.js', root)), ...args];
const child = spawn(process.execPath, invocation, {
  cwd, stdio: 'inherit', windowsHide: true,
  env,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
