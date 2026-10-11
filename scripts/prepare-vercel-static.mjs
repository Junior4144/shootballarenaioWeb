import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = resolve(root, process.argv[2] ?? 'apps/web/dist');
const destination = resolve(root, 'deploy/vercel/public');
if (!source.startsWith(root + sep) || source === destination || source.startsWith(destination + sep)) throw new Error('Build source must be inside the repository and separate from the upload directory');
const revision = process.env.RELEASE_SHA;
if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('RELEASE_SHA must identify the built frontend');
const html = await readFile(resolve(source, 'index.html'), 'utf8');
if (!html.includes('ORB-SKIRMISH') || !html.includes('/assets/')) throw new Error('A built player frontend is required');
const entries = await readdir(source, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isSymbolicLink() || entry.name.startsWith('.')) throw new Error('Unexpected hidden file or symlink in build');
}
// Fixed generated destination under deploy/vercel; never remove the source.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of entries) {
  if (entry.name === 'admin' || entry.name === 'origin-revision.txt') continue;
  await cp(resolve(source, entry.name), resolve(destination, entry.name), { recursive: true });
}
await cp(resolve(root, 'deploy/vercel/favicon.ico'), resolve(destination, 'favicon.ico'));
await writeFile(resolve(destination, 'release.json'), JSON.stringify({ revision, hosting: 'vercel-static' }) + '\n');
console.log('Prepared public frontend for Vercel:', revision);
