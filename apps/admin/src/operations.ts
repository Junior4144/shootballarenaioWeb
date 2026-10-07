import { LINKS, type GameTelemetry, type HealthCheck, type RecordPage } from '@shootball/admin-contracts';
const escape = (v: unknown) => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Get = (path: string) => Promise<any>;
let recordsView = ''; let offset = 0; let search = '';
let generation = 0;
export function cancelOperations() { generation++; }
export function clearOperations() { generation++; recordsView=''; offset=0; search=''; }
const table = (headers: string[], rows: unknown[][]) => '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const format = (v: unknown) => v && typeof v==='object' ? JSON.stringify(v) : v;
export function serviceLinks() { return '<p><a href="'+LINKS.primary+'" target="_blank" rel="noopener">Open website — Vercel (primary)</a></p><p><a href="'+LINKS.origin+'" target="_blank" rel="noopener">Open GCP origin (direct)</a></p>'; }
export async function renderOperations(host: HTMLElement, view: string, get: Get) {
  const current = ++generation;
  host.innerHTML='<section class="panel"><p role="status">Loading '+escape(view)+'…</p></section>';
  try {
    if (['Accounts & guests','Admin activity','Access directory'].includes(view)) {
      if (recordsView!==view) { recordsView=view; offset=0; search=''; }
      const route=view==='Accounts & guests'?'accounts':view==='Admin activity'?'activity':'memberships';
      const page: RecordPage = await get(route+'?offset='+offset+'&search='+encodeURIComponent(search));
      if (current!==generation) return;
      const columns=route==='accounts'?['id','display_name','created_at','last_sign_in_at','email_confirmed']:route==='activity'?['id','occurred_at','actor_id','subject_id','action','old_value','new_value']:['user_id','roles','environments','granted_at','revoked_at','reason'];
      host.innerHTML='<section class="panel"><h2>'+escape(view)+'</h2><p>'+escape(page.source)+'</p>'+(route==='accounts'?'<p>Registered accounts across the scoped Supabase project. Last sign-in is authentication activity, not gameplay presence. Temporary guests are counted in live telemetry; no persistent guest directory exists.</p>':route==='activity'?'<p>Membership changes recorded by the database. Gameplay operations and configuration publication are not implemented.</p>':'<p>Current and revoked memberships. Role changes require the existing administrative database workflow.</p>')+
        '<form id="record-search" class="settings-tools"><label>Search records<input id="record-query" maxlength="100" value="'+escape(search)+'"></label><button>Search</button></form>'+table(columns,page.rows.map(row=>columns.map(key=>format(row[key]))))+(page.rows.length?'':'<p>No matching records.</p>')+'<div class="actions"><button id="previous" '+(offset===0?'disabled':'')+'>Previous page</button><span>Page '+(Math.floor(offset/page.limit)+1)+'</span><button id="next" '+(!page.hasMore?'disabled':'')+'>Next page</button></div></section>';
      host.querySelector<HTMLFormElement>('#record-search')!.onsubmit=e=>{e.preventDefault();search=host.querySelector<HTMLInputElement>('#record-query')!.value;offset=0;void renderOperations(host,view,get);};
      host.querySelector<HTMLButtonElement>('#previous')!.onclick=()=>{offset=Math.max(0,offset-page.limit);void renderOperations(host,view,get);};
      host.querySelector<HTMLButtonElement>('#next')!.onclick=()=>{offset+=page.limit;void renderOperations(host,view,get);};
      return;
    }
    if (view==='Health & alerts') {
      const result: { checks: HealthCheck[]; source: string } = await get('health');
      if (current!==generation) return;
      const failed=result.checks.filter(c=>c.status!=='healthy');
      const primary=result.checks.find(c=>c.id==='primary'), origin=result.checks.find(c=>c.id==='origin');
      const mismatch=primary?.revision && origin?.revision && primary.revision!==origin.revision;
      host.innerHTML='<section class="panel"><h2>Deployment health</h2>'+serviceLinks()+'<p>'+escape(result.source)+'</p><p>Measurements are taken from the admin service. They check HTTPS and process liveness, not a full player connection.</p></section>'+(!result.checks.length?'<section class="panel"><p>Production probes are disabled in local development.</p></section>':result.checks.map(c=>'<section class="panel"><h2>'+escape(c.name)+'</h2><span class="badge">'+escape(c.status)+'</span><p>'+escape(c.message)+'</p><dl><dt>Endpoint</dt><dd>'+escape(c.url)+'</dd><dt>Checked</dt><dd>'+escape(c.checkedAt)+'</dd><dt>Latency</dt><dd>'+c.latencyMs+' ms</dd><dt>Release</dt><dd>'+escape(c.revision)+'</dd></dl></section>').join(''))+'<section class="panel"><h2>Current observations</h2><p>'+(mismatch?'Vercel and GCP are reporting different release revisions.':failed.length?failed.length+' endpoint check(s) failed.':result.checks.length?'All configured endpoint checks passed.':'No observations available.')+'</p><p class="muted">These checks are refreshed while the panel is open and cached for 60 seconds. Persistent incident history, background alerting, notifications and Cloud Logging are not connected.</p></section>';
      return;
    }
    const data: GameTelemetry = await get('telemetry');
    if (current!==generation) return;
    const stale=Date.now()-Date.parse(data.observedAt)>30_000;
    if (view==='Overview') {
      host.innerHTML='<section class="panel"><h2>Live game</h2><p>'+escape(data.observedAt)+' · '+(stale?'STALE':'Observed')+'</p>'+table(['Connected humans','Guests','Accounts','Rooms','Reserved seats'],[[data.totals.humans,data.totals.guests,data.totals.accounts,data.totals.rooms,data.totals.reservedSeats]])+'<p class="muted">Connected seats, not unique people. See Live matches for room details.</p></section>';
      return;
    }
    host.innerHTML='<section class="panel"><h2>Live game telemetry</h2><p>'+escape(data.observedAt)+' · '+(stale?'STALE':'Observed')+' · protected game-process endpoint</p><p>Connected humans exclude bots and reserved reconnect seats. Counters reset on game-process restart.</p></section><div class="metrics">'+Object.entries(data.totals).map(([label,value])=>'<article class="panel metric"><h2>'+escape(label)+'</h2><strong>'+escape(value)+'</strong></article>').join('')+'</div>'+ (view==='Traffic & engagement'?'<section class="panel"><h2>Activity since process start</h2>'+table(['Successful joins','Completed rooms','Process uptime'],[[data.joinsSinceBoot,data.roomsCompletedSinceBoot,Math.floor(data.uptimeSeconds)+' seconds']])+'<p>Joins count admissions, not unique people. Reconnects do not count as new joins. Historical DAU/MAU, visits, conversion and playtime require persistent event ingestion; no estimates are substituted.</p></section>':'<section class="panel"><h2>Rooms and matches</h2>'+table(['Room','Phase','Humans','Guests','Accounts','Reserved','Bots','Seat limit','Admissions','Elapsed','Tick p95'],data.rooms.map(r=>[r.id,r.phase,r.humans,r.guests,r.accounts,r.reservedSeats,r.bots,r.maxPlayers,r.admission,Math.floor(r.elapsedSeconds)+' s',r.tickP95Ms.toFixed(2)+' ms']))+(data.rooms.length?'':'<p>No active rooms were observed.</p>')+'<p class="muted">Tick p95 covers the latest 300 simulation steps per room. Server controls remain unavailable until durable operations and audit tracking are implemented.</p></section>')+'<section class="panel"><h2>Game process</h2>'+table(['Build','Protocol','Uptime','Resident memory','Boot ID'],[[data.revision,data.protocol,Math.floor(data.uptimeSeconds)+' s',(data.memoryRssBytes/1048576).toFixed(1)+' MiB',data.bootId]])+'</section>';
  } catch (e) {
    if (current!==generation) return;
    host.innerHTML='<section class="panel"><h2>'+escape(view==='Overview'?'Live game':view)+'</h2><p role="alert">'+escape(e instanceof Error?e.message:'Observation unavailable')+'</p><p>No measurement can be inferred. Use Refresh to retry.</p></section>';
  }
}
