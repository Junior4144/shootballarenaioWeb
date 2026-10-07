import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseManifest } from '@shootball/admin-contracts';
import { FixtureInventory, GcpInventory, googleComputeGet } from './inventory';
import { assertLocalRuntime, createAdminServer } from './server';
import { supabaseAuthorizer } from './auth';
const authMode = process.env.ADMIN_AUTH_MODE;
if (authMode !== 'local' && authMode !== 'supabase') throw new Error('ADMIN_AUTH_MODE must be local or supabase');
if (authMode === 'local') assertLocalRuntime(process.env);
const hosted = authMode === 'supabase';
const port = Number(process.env.PORT ?? process.env.ADMIN_API_PORT ?? 2570);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ADMIN_API_PORT');
const provider = process.env.ADMIN_INVENTORY_PROVIDER ?? (hosted ? 'gcp' : 'fixture');
if (!['fixture', 'gcp'].includes(provider)) throw new Error('Invalid ADMIN_INVENTORY_PROVIDER');
if ((process.env.NODE_ENV === 'production' || process.env.K_SERVICE) && provider !== 'gcp') throw new Error('Hosted fixtures are disabled');
const manifestPath = process.env.ADMIN_MANIFEST_PATH ?? fileURLToPath(new URL('../../../deploy/environments.json', import.meta.url));
const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
const inventory = provider === 'gcp' ? new GcpInventory(manifest, googleComputeGet()) : new FixtureInventory();
const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
const defaultEnvironment = process.env.ADMIN_ENVIRONMENT ?? 'gcp-test';
if (!['local', 'gcp-test', 'production'].includes(defaultEnvironment)) throw new Error('Invalid ADMIN_ENVIRONMENT');
const server = createAdminServer({
  token: hosted ? undefined : process.env.ADMIN_LOCAL_TOKEN,
  authorize: hosted ? supabaseAuthorizer(url, key) : undefined,
  inventory, staticRoot: process.env.STATIC_ROOT,
  publicConfig: hosted ? { supabaseUrl: url, publishableKey: key, environment: defaultEnvironment as 'local' | 'gcp-test' | 'production' } : undefined,
  allowedHosts: [`127.0.0.1:${port}`],
  allowedOrigins: process.env.NODE_ENV === 'production' ? [] : ['http://127.0.0.1:5174', 'http://127.0.0.1:5191', 'http://127.0.0.1:5173'],
});
server.requestTimeout = 15_000; server.headersTimeout = 10_000;
const host = process.env.NODE_ENV === 'production' || process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1';
server.listen(port, host, () => console.log(`Admin API listening on ${host}:${port} • ${authMode} auth • ${provider} inventory`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
