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
  deploy [--prod] [--yes]  Deploy only the proxy folder (preview by default)
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
};
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
const args = [...commands[command], ...options, '--scope', scope.orgId, '--cwd', cwd];
if (command === 'deploy') args.push('--local-config', fileURLToPath(new URL('deploy/vercel/vercel.json', root)));
const env = { ...process.env, VERCEL_ORG_ID: scope.orgId, VERCEL_PROJECT_ID: scope.projectId };
// With IDs in the environment, `link` skips writing .vercel/project.json.
// This command already pins the project with --project and the team with --scope.
if (command === 'link') { delete env.VERCEL_ORG_ID; delete env.VERCEL_PROJECT_ID; }
const child = spawn(process.execPath, [fileURLToPath(new URL('node_modules/vercel/dist/index.js', root)), ...args], {
  cwd, stdio: 'inherit', windowsHide: true,
  env,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
