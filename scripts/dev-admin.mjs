import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv.includes('--fixture') ? 'local' : process.env.ADMIN_AUTH_MODE ?? 'supabase';
const token = process.env.ADMIN_LOCAL_TOKEN || randomBytes(32).toString('hex');
console.log(mode === 'local' ? `Local admin: http://127.0.0.1:5174/admin/\nSession token: ${token}` : 'Admin sign in: http://127.0.0.1:5174/admin/');
const children = [
  spawn(process.execPath, ['--env-file-if-exists=../../.env', '--import', 'tsx', 'src/index.ts'], { cwd: new URL('../apps/admin-api/', import.meta.url), stdio: 'inherit', env: { ...process.env, ADMIN_API_PORT: '2570', ADMIN_AUTH_MODE: mode, ADMIN_LOCAL_TOKEN: token, ...(mode === 'local' ? { ADMIN_INVENTORY_PROVIDER: 'fixture' } : {}) } }),
  spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: new URL('../apps/admin/', import.meta.url), stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code; }
for (const child of children) { child.on('error', () => stop(1)); child.on('exit', code => stop(code ?? 0)); }
process.once('SIGINT', () => stop()); process.once('SIGTERM', () => stop());
