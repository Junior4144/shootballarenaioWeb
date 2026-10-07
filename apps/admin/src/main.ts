import { liveNotice, liveTarget } from './runtime';
import { GCP_PROJECT, isStale, type Dashboard, type Environment, type Observation } from '@shootball/admin-contracts';
import './style.css';
import { updateContent } from './dom';
import { renderSettings, clearSettings } from './settings';
import { renderOperations, cancelOperations, clearOperations, operationsPending, serviceLinks } from './operations';
import { loadAuth, renderSignIn, accessToken, readLiveTraffic, signOut, type AuthConfig } from './signin';
let authConfig: AuthConfig = { mode: 'local' };

const tabs = ['Overview', 'Servers', 'Live matches', 'Traffic & engagement', 'Accounts & guests', 'Game settings', 'Architecture', 'Health & alerts', 'Admin activity', 'Access', 'Access directory'];
const app = document.querySelector<HTMLDivElement>('#app')!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
let token = ''; // Intentionally memory-only. Never a VITE_* secret or persisted session.
let selected = 'Overview';
let environment: Environment = 'local';
let data: Dashboard | null = null;
let error = '';
let busy = false;
let controller: AbortController | undefined;
let requestVersion = 0;
let filter = '';
let selectedNode = 'admin';

function observation(o: Observation<unknown>) {
  return `<span class="badge">${escape(isStale(o) ? 'Stale' : o.availability.replaceAll('-', ' '))}</span><p class="muted">${escape(o.source)} · ${escape(o.environment)}<br>${o.observedAt ? `Observed ${escape(new Date(o.observedAt).toLocaleTimeString())} · stale after ${o.staleAfter}s` : 'No observation yet'}</p>`;
}
function login() {
  if (authConfig.mode === 'supabase') return renderSignIn(app, environment, next => { token = next; error = ''; render(); void refresh(); }, error);
  app.innerHTML = `<main class="login panel"><p class="eyebrow">SHOOTBALL ARENA / OPERATIONS</p><h1>Control room</h1><p>A separate workspace for game operations.</p><div class="notice">Local fixture session. Restart without ADMIN_AUTH_MODE=local to use administrator sign-in.</div><form><label for="token">Local session token</label><input id="token" type="password" autocomplete="off" required minlength="32" placeholder="Paste the token printed by npm run dev:admin"><button class="primary" type="submit">Open control room →</button></form><p role="alert">${escape(error)}</p><p class="muted">The token stays in memory and is cleared when you sign out or reload.</p></main>`;
  app.querySelector('form')!.onsubmit = event => { event.preventDefault(); token = app.querySelector<HTMLInputElement>('#token')!.value; error = ''; render(); void refresh(); };
}
function overview() {
  const inventory = data!.inventory;
  const servers = inventory.value;
  return `<div class="metrics"><article class="panel metric"><h2>Registered servers</h2><strong>${servers ? servers.length : 'Unavailable'}</strong><p>Servers in this deployment</p></article><article class="panel metric"><h2>Running VMs</h2><strong>${servers ? servers.filter(server => server.providerState === 'RUNNING').length : 'Unavailable'}</strong><p>Compute Engine power state</p></article><article class="panel metric"><h2>Environment</h2><strong>${environment === 'production' ? 'Production' : 'Local fixture'}</strong><p>${environment === 'production' ? 'Live GCP deployment' : 'Development data'}</p></article></div><div class="columns"><section class="panel"><h2>Server inventory</h2>${observation(inventory)}<p>${escape(inventory.message)}</p><button data-tab="Servers">Inspect servers →</button></section><section class="panel"><h2>Deployed services</h2>${serviceLinks()}<p>Primary website: Vercel proxy<br>Web and admin origin: Cloud Run<br>Multiplayer: Compute Engine with HTTPS<br>Accounts: Supabase</p><button data-tab="Architecture">View architecture →</button><p class="muted">Live matches and Traffic show process telemetry when the game release supports it. Traffic compares stored game activity and website visits. Billing is not connected.</p></section></div><div id="overview-live"></div>`;
}
function servers() {
  const inventory = data!.inventory;
  const rows = inventory.value?.filter(r => `${r.name} ${r.zone} ${r.providerState}`.toLowerCase().includes(filter.toLowerCase()));
  return `<section class="panel"><h2>VM inventory</h2>${observation(inventory)}<p>${escape(inventory.message)}</p>${rows ? `<div class="table-wrap" tabindex="0" aria-label="Scrollable server inventory"><table><caption>Registered game servers</caption><thead><tr><th>Server</th><th>Zone</th><th>VM state</th></tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${escape(r.name)}</th><td>${escape(r.zone)}</td><td>${escape(r.providerState)}</td></tr>`).join('')}</tbody></table></div>${rows.length ? '' : '<p>No matching registered resources.</p>'}` : '<div class="empty">Inventory unavailable. No server count can be inferred.</div>'}</section><section class="panel"><h2>Game connection</h2><p>Multiplayer endpoint: <code>wss://136.71.64.19.sslip.io</code></p><p>VM power state does not establish game readiness or player count. Open Live matches for authenticated room telemetry.</p></section>`;
}
function architecture() {
  const nodes = data!.architecture.filter(n => `${n.name} ${n.responsibility}`.toLowerCase().includes(filter.toLowerCase()));
  const node = data!.architecture.find(n => n.id === selectedNode)!;
  return `<p class="muted">Production deployment topology • configuration labels, not measured health. Select a component to inspect dependencies; use Health & alerts for endpoint observations.</p><div class="architecture">${nodes.map(n => `<button class="panel node ${n.id === selectedNode ? 'selected' : ''}" data-node="${n.id}" aria-pressed="${n.id === selectedNode}"><span class="badge">${escape(n.status)}</span><strong>${escape(n.name)}</strong><span>${escape(n.responsibility)}</span><small>→ ${n.dependencies.map(id => escape(data!.architecture.find(n => n.id === id)?.name)).join(', ') || 'No downstream dependency'}</small></button>`).join('')}</div><section class="panel" aria-live="polite"><h2>${escape(node.name)}</h2><p>${escape(node.detail)}</p><p class="muted">Environment: ${environment} · Deployment manifest + implementation status</p></section>`;
}
function integrations() {
  return `<section class="panel"><h2>Environment and access</h2><dl><dt>Environment</dt><dd>${environment === 'production' ? 'Production' : 'Local fixture'}</dd><dt>GCP project</dt><dd>${GCP_PROJECT}</dd><dt>Access</dt><dd>${escape(data!.identity.role)} · Read-only</dd><dt>Admin authentication</dt><dd>${authConfig.mode === 'supabase' ? 'Verified sign-in and current admin membership' : 'Local fixture token'}</dd></dl></section><section class="panel"><h2>Provider connection</h2>${observation(data!.inventory)}<p>${escape(data!.inventory.message)}</p><p>Admin membership and membership-change audit records are stored in the private database. Server controls are not available in this panel.</p></section>`;
}
async function renderContent() {
  const content = document.querySelector('#content');
  if (!content) return;
  cancelOperations();
  bindNavigation();
  if (data && selected === 'Game settings') { renderSettings(content as HTMLElement); return; }
  if (data && ['Live matches','Traffic & engagement','Accounts & guests','Health & alerts','Admin activity','Access directory'].includes(selected)) { await renderOperations(content as HTMLElement, selected, readSection); return; }
  updateContent(content, !data ? `<section class="panel empty">${busy ? 'Loading observations…' : 'No observations available.'}</section>` : selected === 'Overview' ? overview() : selected === 'Servers' ? servers() : selected === 'Architecture' ? architecture() : integrations());
  bindNavigation();
  const live = content.querySelector<HTMLElement>('#overview-live');
  if (live) await renderOperations(live, 'Overview', readSection);
  content.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(b => b.onclick = () => { selectedNode = b.dataset.node!; renderContent(); document.querySelector<HTMLButtonElement>(`[data-node="${selectedNode}"]`)?.focus(); });
}
function bindNavigation() {
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => b.onclick = () => { selected = b.dataset.tab!; filter = ''; render(); document.querySelector<HTMLElement>('#page-title')?.focus(); });
}
function render() {
  if (!token) return login();
  app.innerHTML = `<div class="shell"><aside><div class="brand"><span class="brand-mark">SB</span><div>SHOOTBALL<small>CONTROL ROOM</small></div></div><button id="menu" aria-expanded="false" aria-controls="nav">Menu ☰</button><nav id="nav" aria-label="Administration">${tabs.map((t, i) => `<button data-tab="${escape(t)}" ${t === selected ? 'aria-current="page"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${escape(t)}</button>`).join('')}</nav><div class="sidebar-foot">${environment === 'production' ? 'PRODUCTION' : 'LOCAL FIXTURE'}<br>Administration</div></aside><div class="workspace"><header>${liveNotice ? `<span class="badge">${liveNotice}</span>` : ''}<span class="badge" id="environment">${environment === 'production' ? 'Production' : 'Local fixture'}</span><div class="identity">${escape(data?.identity.label ?? 'Signed-in session')}<br>${escape(data?.identity.role ?? (authConfig.mode === 'supabase' ? 'Verified admin session' : 'Local development viewer'))}<br><small>Signed-in session</small></div><button id="logout">Sign out</button></header><main><div class="heading"><div><p class="eyebrow">OPERATIONS / ${escape(environment)}</p><h1 id="page-title" tabindex="-1">${escape(selected)}</h1></div><button id="refresh" ${busy ? 'disabled' : ''}>${busy ? 'Refreshing…' : '↻ Refresh'}</button></div><div class="notice">${environment === 'local' ? 'LOCAL FIXTURE — sample inventory; gameplay metrics are not connected.' : `${environment.toUpperCase()} — live server inventory and deployment details.`}</div><div class="toolbar"><label${['Servers','Architecture'].includes(selected) ? '' : ' hidden'}>Filter servers / architecture<input id="search" type="search" placeholder="Name, zone or component" value="${escape(filter)}"></label><p class="muted" id="refresh-info">Last refresh: ${data ? escape(new Date(data.generatedAt).toLocaleTimeString()) : 'Never'}<br>Polling pauses while this tab is hidden</p></div><p id="error" role="alert">${escape(error)}</p><div id="content"></div><footer>Scoped operations · Provider state ≠ process readiness · Missing data remains unknown</footer></main></div></div>`;
  renderContent();
  app.querySelector<HTMLButtonElement>('#refresh')!.onclick = () => void refresh();
  app.querySelector<HTMLButtonElement>('#logout')!.onclick = async () => { requestVersion++; controller?.abort(); token = ''; data = null; error = ''; busy = false; clearSettings(); clearOperations(); if (authConfig.mode === 'supabase') await signOut(); render(); };
  app.querySelector<HTMLInputElement>('#search')!.oninput = event => { filter = (event.target as HTMLInputElement).value; renderContent(); };
  app.querySelector<HTMLButtonElement>('#menu')!.onclick = event => { const b = event.currentTarget as HTMLButtonElement; const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); app.querySelector('nav')!.classList.toggle('open', open); };
}
async function readSection(path: string) {
  const version = requestVersion;
  const session = authConfig.mode === 'supabase' ? await accessToken() : token;
  if (!session) throw new Error('Sign in again to view this section.');
  const separator = path.includes('?') ? '&' : '?';
  const response = liveTarget && path.split('?')[0] === 'traffic' && new URLSearchParams(path.split('?')[1]).get('source') !== 'posthog'
    ? await readLiveTraffic(path, session)
    : await fetch('/admin/v1/' + path + separator + 'environment=' + environment, { headers: { Authorization: 'Bearer ' + session }, cache: 'no-store', signal: AbortSignal.timeout(path.includes('source=posthog') ? 30_000 : 12_000) });
  if (version !== requestVersion) throw new Error('Observation superseded by a newer session.');
  if (response.status === 401 || response.status === 403) {
    token = ''; data = null; clearSettings(); clearOperations(); error = 'Administrator access expired or was revoked. Sign in again.';
    if (authConfig.mode === 'supabase') await signOut(); render(); throw new Error(error);
  }
  const body = await response.json();
  if (version !== requestVersion) throw new Error('Observation superseded by a newer session.');
  if (!response.ok) throw new Error(body.error ?? 'Section unavailable');
  return body;
}
function updateStatus() {
  const button = app.querySelector<HTMLButtonElement>('#refresh');
  if (button) { button.disabled = busy; button.textContent = busy ? 'Refreshing…' : '↻ Refresh'; }
  const message = app.querySelector('#error');
  if (message) message.textContent = error;
  const info = app.querySelector('#refresh-info');
  if (info) info.textContent = 'Last inventory refresh: ' + (data ? new Date(data.generatedAt).toLocaleTimeString() : 'Never') + ' · Auto-refresh every 15s while visible';
  const identity = app.querySelector('.identity');
  if (identity && data) updateContent(identity, escape(data.identity.label) + '<br>' + escape(data.identity.role) + '<br><small>Signed-in session</small>');
}
async function refresh() {
  if (busy || !token) return;
  busy = true; updateStatus();
  controller?.abort(); controller = new AbortController();
  const currentController = controller;
  const version = ++requestVersion; const currentEnvironment = environment;
  updateStatus();
  const timeout = setTimeout(() => currentController.abort(), 12_000);
  try {
    if (authConfig.mode === 'supabase') {
      const session = await accessToken();
      if (version !== requestVersion) return;
      token = session ?? '';
      if (!token) { data = null; clearOperations(); clearSettings(); return; }
    }
    const response = await fetch(`/admin/v1/dashboard?environment=${currentEnvironment}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
    if (version !== requestVersion) return;
    if (response.status === 401) { token = ''; data = null; clearSettings(); clearOperations(); throw new Error(authConfig.mode === 'supabase' ? 'Your session expired. Sign in again.' : 'Session rejected. Copy the current local token from the terminal.'); }
    if (response.status === 403 && authConfig.mode === 'supabase') { token = ''; data = null; clearSettings(); clearOperations(); await signOut(); throw new Error('Admin access denied or revoked. Sign in again after your access is restored.'); }
    if (!response.ok) throw new Error(response.status === 403 ? 'Permission denied for this origin.' : 'Admin API unavailable. Please retry shortly.');
    const result: Dashboard = await response.json();
    if (version !== requestVersion) return;
    if (result.environment !== currentEnvironment) throw new Error('Environment mismatch; observation rejected.');
    data = result; error = '';
    clearTimeout(timeout);
    await renderContent();
  } catch (e) {
    if (version === requestVersion) { error = (e instanceof Error && e.name !== 'AbortError' ? e.message : 'Request timed out.') + (data ? ' Showing previous observations; refresh to retry.' : ''); }
  } finally { clearTimeout(timeout); if (version === requestVersion) { busy = false; if (!token) render(); else updateStatus(); } }
}
setInterval(() => { if (token && !document.hidden && !busy && !operationsPending() && selected !== 'Game settings' && !document.activeElement?.matches('input, select, textarea')) void refresh(); }, 15_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && token && !busy && !operationsPending() && selected !== 'Game settings') void refresh(); });
app.textContent = 'Loading administrator sign-in?';
loadAuth().then(config => { authConfig = config; environment = config.mode === 'supabase' ? 'production' : 'local'; render(); }).catch(() => { app.textContent = 'Admin authentication service unavailable. Please reload and try again.'; });
