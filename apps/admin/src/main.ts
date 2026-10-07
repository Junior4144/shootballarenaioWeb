import { environments, GCP_PROJECT, isStale, type Dashboard, type Environment, type Observation } from '@shootball/admin-contracts';
import './style.css';
import { loadAuth, renderSignIn, accessToken, signOut, type AuthConfig } from './signin';
let authConfig: AuthConfig = { mode: 'local' };

const tabs = ['Overview', 'Traffic & engagement', 'Accounts & guests', 'Servers & matches', 'Game settings', 'Architecture & health', 'Costs & usage', 'Admin activity', 'Logs & alerts', 'Access & integrations'];
const app = document.querySelector<HTMLDivElement>('#app')!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
let token = ''; // Intentionally memory-only. Never a VITE_* secret or persisted session.
let selected = 'Overview';
let environment: Environment = 'local';
try { const stored = localStorage.getItem('admin-environment'); if (environments.includes(stored as Environment)) environment = stored as Environment; } catch { /* storage may be disabled */ }
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
  return `<div class="metrics">${data!.metrics.map(m => `<article class="panel metric"><h2>${escape(m.label)}</h2><strong>${m.data.value === null ? 'Unknown' : escape(m.data.value)}</strong><p>${escape(m.unit)}</p>${observation(m.data)}</article>`).join('')}</div><div class="columns"><section class="panel"><h2>Registered server inventory</h2>${observation(data!.inventory)}<p>${escape(data!.inventory.message)}</p><button data-tab="Servers & matches">Inspect servers →</button></section><section class="panel"><h2>Release readiness</h2><p>Foundation / read-only</p><ul><li>Separate admin app and API</li><li>Scoped Compute Engine inventory adapter</li><li>Pending: verified admin membership and MFA</li><li>Pending: durable operations, telemetry and billing</li></ul><button data-tab="Access & integrations">View integrations →</button></section></div>`;
}
function servers() {
  const inventory = data!.inventory;
  const rows = inventory.value?.filter(r => `${r.name} ${r.zone} ${r.providerState}`.toLowerCase().includes(filter.toLowerCase()));
  return `<section class="panel"><h2>VM inventory</h2>${observation(inventory)}<p>${escape(inventory.message)}</p>${rows ? `<div class="table-wrap" tabindex="0" aria-label="Scrollable server inventory"><table><caption>VM state and process health are independent</caption><thead><tr>${['Server', 'Zone', 'VM state', 'Process', 'Readiness', 'Admissions', 'Humans', 'Rooms'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${escape(r.name)}</th><td>${escape(r.zone)}</td><td>${escape(r.providerState)}</td><td>Unknown</td><td>Unknown</td><td>Unknown</td><td>Unknown</td><td>Unknown</td></tr>`).join('')}</tbody></table></div>${rows.length ? '' : '<p>No matching registered resources.</p>'}` : '<div class="empty">Inventory unavailable. No server count can be inferred.</div>'}</section><section class="panel"><h2>Server controls</h2><p>${escape(data!.capabilities[0].reason)}</p><div class="actions">${data!.capabilities.filter(c => c.label !== 'Publish config').map(c => `<button disabled title="${escape(c.reason)}">${escape(c.label)}</button>`).join('')}</div><p class="muted">Additional game processes remain gated on distributed matchmaking.</p></section>`;
}
function architecture() {
  const nodes = data!.architecture.filter(n => `${n.name} ${n.responsibility}`.toLowerCase().includes(filter.toLowerCase()));
  const node = data!.architecture.find(n => n.id === selectedNode)!;
  return `<p class="muted">Logical architecture • planned connections, not measured health. Select a component to inspect its dependencies.</p><div class="architecture">${nodes.map(n => `<button class="panel node ${n.id === selectedNode ? 'selected' : ''}" data-node="${n.id}" aria-pressed="${n.id === selectedNode}"><span class="badge">${escape(n.status)}</span><strong>${escape(n.name)}</strong><span>${escape(n.responsibility)}</span><small>→ ${n.dependencies.map(id => escape(data!.architecture.find(n => n.id === id)?.name)).join(', ') || 'No downstream dependency'}</small></button>`).join('')}</div><section class="panel" aria-live="polite"><h2>${escape(node.name)}</h2><p>${escape(node.detail)}</p><p class="muted">Environment: ${environment} · Deployment manifest + implementation status</p></section>`;
}
function integrations() {
  return `<section class="panel"><h2>Environment and access</h2><dl><dt>Selected environment</dt><dd>${environment}</dd><dt>GCP project</dt><dd>${GCP_PROJECT}</dd><dt>Session</dt><dd>Local development viewer · read-only</dd><dt>Hosted admin access</dt><dd>Verified Supabase session, live membership and MFA are required</dd></dl></section><section class="panel"><h2>Provider connections</h2>${observation(data!.inventory)}<p>${escape(data!.inventory.message)}</p><p>Telemetry, billing export, account directory and durable admin storage are not connected.</p><p class="muted">Project credentials remain in the API process. Integration settings cannot be changed from this panel yet.</p></section>`;
}
function pending() {
  const descriptions: Record<string, string> = {
    'Traffic & engagement': 'Gameplay event ingestion and aggregate queries are not connected. DAU/MAU and conversion require measured activity.',
    'Accounts & guests': 'The privileged account directory and guest-session store are not connected. Player credentials do not grant administrator access.',
    'Game settings': 'Schema migration, field metadata and revision storage are pending. Gameplay still uses the existing shared configuration.',
    'Costs & usage': 'Billing export and external provider costs are not connected. Total spend and forecast are unknown.',
    'Admin activity': 'Membership changes are audited in the private database. The activity browser and operational mutations are not implemented.',
    'Logs & alerts': 'Cloud Logging, monitoring and alert integrations are not connected. No incident count can be inferred.',
  };
  return `<section class="panel empty"><span class="badge">Not connected</span><h2>${escape(selected)}</h2><p>${escape(descriptions[selected])}</p><p class="muted">${environment} · No observation or reporting window available</p></section>`;
}
function renderContent() {
  const content = document.querySelector('#content');
  if (!content) return;
  content.innerHTML = !data ? `<section class="panel empty">${busy ? 'Loading observations…' : 'No observations available.'}</section>` : selected === 'Overview' ? overview() : selected === 'Servers & matches' ? servers() : selected === 'Architecture & health' ? architecture() : selected === 'Access & integrations' ? integrations() : pending();
  bindNavigation();
  content.querySelectorAll<HTMLButtonElement>('[data-node]').forEach(b => b.onclick = () => { selectedNode = b.dataset.node!; renderContent(); document.querySelector<HTMLButtonElement>(`[data-node="${selectedNode}"]`)?.focus(); });
}
function bindNavigation() {
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => b.onclick = () => { selected = b.dataset.tab!; filter = ''; render(); document.querySelector<HTMLElement>('#page-title')?.focus(); });
}
function render() {
  if (!token) return login();
  app.innerHTML = `<div class="shell"><aside><div class="brand"><span class="brand-mark">SB</span><div>SHOOTBALL<small>CONTROL ROOM</small></div></div><button id="menu" aria-expanded="false" aria-controls="nav">Menu ☰</button><nav id="nav" aria-label="Administration">${tabs.map((t, i) => `<button data-tab="${escape(t)}" ${t === selected ? 'aria-current="page"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${escape(t)}</button>`).join('')}</nav><div class="sidebar-foot">FOUNDATION 01<br>Read-only development</div></aside><div class="workspace"><header><label>Environment<select id="environment" aria-label="Environment">${environments.map(e => `<option ${e === environment ? 'selected' : ''}>${e}</option>`).join('')}</select></label><div class="identity">${escape(data?.identity.role ?? (authConfig.mode === 'supabase' ? 'Verified admin session' : 'Local development viewer'))}<br><small>Session held in memory</small></div><button id="logout">Sign out</button></header><main><div class="heading"><div><p class="eyebrow">OPERATIONS / ${escape(environment)}</p><h1 id="page-title" tabindex="-1">${escape(selected)}</h1></div><button id="refresh" ${busy ? 'disabled' : ''}>${busy ? 'Refreshing…' : '↻ Refresh'}</button></div><div class="notice">${environment === 'local' ? 'LOCAL FIXTURE — sample inventory; gameplay metrics are not connected.' : `${environment.toUpperCase()} — read-only observations; cloud controls are disabled.`}</div><div class="toolbar"><label>Filter servers / architecture<input id="search" type="search" placeholder="Name, zone or component" value="${escape(filter)}"></label><p class="muted">Last refresh: ${data ? escape(new Date(data.generatedAt).toLocaleTimeString()) : 'Never'}<br>Polling pauses while this tab is hidden</p></div><p id="error" role="alert">${escape(error)}</p><div id="content"></div><footer>Scoped operations · Provider state ≠ process readiness · Missing data remains unknown</footer></main></div></div>`;
  renderContent();
  app.querySelector<HTMLSelectElement>('#environment')!.onchange = event => {
    environment = (event.target as HTMLSelectElement).value as Environment;
    try { localStorage.setItem('admin-environment', environment); } catch { /* optional persistence */ }
    data = null; error = ''; void refresh();
  };
  app.querySelector<HTMLButtonElement>('#refresh')!.onclick = () => void refresh();
  app.querySelector<HTMLButtonElement>('#logout')!.onclick = async () => { requestVersion++; controller?.abort(); token = ''; data = null; error = ''; busy = false; if (authConfig.mode === 'supabase') await signOut(); render(); };
  app.querySelector<HTMLInputElement>('#search')!.oninput = event => { filter = (event.target as HTMLInputElement).value; renderContent(); };
  app.querySelector<HTMLButtonElement>('#menu')!.onclick = event => { const b = event.currentTarget as HTMLButtonElement; const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); app.querySelector('nav')!.classList.toggle('open', open); };
}
async function refresh() {
  if (authConfig.mode === 'supabase') { token = await accessToken() ?? ''; if (!token) { data = null; render(); return; } }
  controller?.abort(); controller = new AbortController();
  const currentController = controller;
  const version = ++requestVersion; const currentEnvironment = environment;
  busy = true; render();
  const timeout = setTimeout(() => currentController.abort(), 12_000);
  try {
    const response = await fetch(`/admin/v1/dashboard?environment=${currentEnvironment}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
    if (version !== requestVersion) return;
    if (response.status === 401) { token = ''; data = null; throw new Error('Session rejected. Copy the current local token from the terminal.'); }
    if (response.status === 403 && authConfig.mode === 'supabase') { token = ''; data = null; await signOut(); throw new Error('Admin access denied or revoked. Sign in again after your access is restored.'); }
    if (!response.ok) throw new Error(response.status === 403 ? 'Permission denied for this origin.' : 'Admin API unavailable. Check the API process and retry.');
    const result: Dashboard = await response.json();
    if (version !== requestVersion) return;
    if (result.environment !== currentEnvironment) throw new Error('Environment mismatch; observation rejected.');
    data = result; error = '';
  } catch (e) {
    if (version === requestVersion) { data = null; error = e instanceof Error && e.name !== 'AbortError' ? e.message : 'Request timed out. Observations are unavailable.'; }
  } finally { clearTimeout(timeout); if (version === requestVersion) { busy = false; render(); } }
}
setInterval(() => { if (token && !document.hidden && !busy && !document.activeElement?.matches('input, select')) void refresh(); }, 15_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && token && !busy) void refresh(); });
app.textContent = 'Loading administrator sign-in?';
loadAuth().then(config => { authConfig = config; if (config.mode === 'supabase') environment = config.environment ?? 'gcp-test'; render(); }).catch(() => { app.textContent = 'Admin authentication service unavailable. Start the API and reload.'; });
