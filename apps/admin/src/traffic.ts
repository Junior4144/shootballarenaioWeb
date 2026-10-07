import { TRAFFIC_RANGES, trafficSummary, type TrafficHistory, type TrafficPoint, type TrafficRange, type TrafficSource, type GameTelemetry } from '@shootball/admin-contracts';
const escape = (v: unknown) => String(v ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const number = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString(undefined,{maximumFractionDigits:1});
const time = (v: string) => new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
type Metric = 'players'|'guests'|'accounts'|'rooms'|'joins'|'views'|'sessions'|'visitors';
const labels: Record<Metric,string> = {players:'Connected players',guests:'Guests',accounts:'Accounts',rooms:'Active rooms',joins:'Recorded joins',views:'Page views',sessions:'New browser sessions',visitors:'Visitors'};
let source: TrafficSource='game', range: TrafficRange='24h', metric: Metric='players', compare=true;
let scope: 'production'|'development' = 'production';
const metricLabel=(m:Metric)=>source==='posthog'&&m==='sessions'?'Active sessions':labels[m];
const cache = new Map<string,TrafficHistory>();
let live: GameTelemetry | null = null;
export function clearTraffic() { cache.clear(); live=null; source='game'; range='24h'; metric='players'; compare=true; scope='production'; }
const value = (point: TrafficPoint, key: Metric) => point[key] ?? null;
function delta(current: number | null, previous: number | null) {
  if(current===null || previous===null) return 'No comparable data';
  if(previous===0) return current===0 ? 'No change' : 'Up from 0';
  const change=(current-previous)/previous*100;
  return (change>0?'+':'')+number(change)+'% vs previous period';
}
function chart(history: TrafficHistory) {
  const current=history.current, previous=history.previous;
  const compact=matchMedia('(max-width:700px)').matches, width=compact?400:880;
  const max=Math.max(1,...[...current,...(compare?previous:[])].map(p=>value(p,metric) ?? 0));
  const x=(index:number)=>54+index*(width-80)/Math.max(1,current.length-1);
  const y=(v:number)=>242-v/max*206;
  const line=(points:TrafficPoint[],color:string,dashed=false)=>{
    let path='', gap=true;
    const dots:string[]=[];
    points.forEach((point,index)=>{const v=value(point,metric); if(v===null){gap=true;return;}
      path+=(gap?'M':'L')+x(index).toFixed(2)+','+y(v).toFixed(2)+' ';gap=false;
      dots.push('<circle cx="'+x(index)+'" cy="'+y(v)+'" r="2" fill="'+color+'"><title>'+escape(time(point.at)+' · '+metricLabel(metric)+': '+number(v))+'</title></circle>');
    });
    return '<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2.5" '+(dashed?'stroke-dasharray="7 5"':'')+'/>'+dots.join('');
  };
  return '<svg class="traffic-chart" viewBox="0 0 '+width+' 290" role="img" aria-label="'+escape(metricLabel(metric))+' over time, selected period'+(compare?' compared with previous period':'')+'">'+
    [0,.25,.5,.75,1].map(t=>'<line x1="54" x2="'+(width-26)+'" y1="'+y(max*t)+'" y2="'+y(max*t)+'" class="chart-grid"/><text x="44" y="'+(y(max*t)+4)+'" text-anchor="end">'+number(max*t)+'</text>').join('')+
    (compare?line(previous,'#b7a4f6',true):'')+line(current,'#a9ecd3')+
    (compact?[0,.5,1]:[0,.25,.5,.75,1]).map(t=>{const index=Math.round(t*(current.length-1));return current[index]?'<text x="'+x(index)+'" y="272" text-anchor="'+(t===0?'start':t===1?'end':'middle')+'">'+escape(new Date(current[index].at).toLocaleString(undefined,compact?{month:'numeric',day:'numeric',hour:'numeric'}:{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))+'</text>':'';}).join('')+'</svg>';
}
export async function renderTraffic(host: HTMLElement, get:(path:string)=>Promise<any>, commit:(html:string)=>void, valid:()=>boolean, reload:()=>void) {
  const selectedSource=source, selectedRange=range, selectedScope=scope, key=source+':'+range+':'+scope;
  let history=cache.get(key), loading=true, historyFailed=false, liveFailed=false;
  const current=()=>valid() && source===selectedSource && range===selectedRange && scope===selectedScope;
  const metrics:Metric[]=source==='game'?['players','guests','accounts','rooms','joins']:source==='posthog'?['views','visitors','sessions']:['views','sessions'];
  const label=metricLabel;
  const paint=()=>{
    if(!current()) return;
    const warning=historyFailed?(history?'History refresh failed; showing the last retrieved history.':source==='posthog'?'PostHog is unavailable. Verify the admin server’s PostHog CLI login and query access.':'Traffic history is unavailable. Refresh to retry.'):history?.analytics?.stale?'PostHog refresh failed; showing cached data with its original update time.':'';
    const hasData=history?.current.some(p=>source==='game'?p.samples>0:p.views!==null);
    const stats=history?trafficSummary(history.current,history.bucketSeconds):null;
    const before=history?trafficSummary(history.previous,history.bucketSeconds):null;
    const sum=(points:TrafficPoint[]|undefined,m:'views'|'sessions')=>points?.some(p=>p[m]!=null)?points.reduce((s,p)=>s+(p[m]??0),0):null;
    const card=(title:string,v:unknown,note:string)=>'<article class="panel metric"><h2>'+title+'</h2><strong>'+escape(v)+'</strong><p>'+escape(note)+'</p></article>';
    let cards='';
    if(source==='game') {
      const liveStale=!live || liveFailed || Date.now()-Date.parse(live.observedAt)>30_000;
      cards=card(liveStale?'Last observed players':'Players right now',number(live?.totals.humans),liveStale?'Live update unavailable or stale':number(live?.totals.guests)+' guests · '+number(live?.totals.accounts)+' accounts')+
        card('Average players',number(stats?.average),delta(stats?.average??null,before?.average??null))+
        card('Peak players',number(stats?.peak),delta(stats?.peak??null,before?.peak??null))+
        card('Recorded joins',number(stats?.joins),delta(stats?.joins??null,before?.joins??null));
    } else if(source==='posthog') {
      const a=history?.analytics;
      cards=card('Page views',number(a?.current.views),delta(a?.current.views??null,a?.previous.views??null))+
        card('Visitors',number(a?.current.visitors),delta(a?.current.visitors??null,a?.previous.visitors??null))+
        card('Active sessions',number(a?.current.sessions),delta(a?.current.sessions??null,a?.previous.sessions??null))+
        card('Views / session',a?.current.sessions?number(a.current.views/a.current.sessions):'—','Based on sessions with pageviews in this period');
    } else {
      const views=sum(history?.current,'views'), sessions=sum(history?.current,'sessions');
      const last=history?.current.at(-1);
      cards=card('Page views',number(views),delta(views,sum(history?.previous,'views')))+card('New sessions',number(sessions),delta(sessions,sum(history?.previous,'sessions')))+
        card('Latest interval',number(last?.views),'Page views in the latest completed '+(history?history.bucketSeconds/60:'—')+' minutes')+
        card('Views / session',views!==null && sessions ? number(views/sessions):'—','Page views per session started in this period');
    }
    commit('<section class="panel traffic-heading"><div><p class="eyebrow">TRAFFIC EXPLORER</p><h2>Current activity, with context</h2><p>Compare the selected period with the equally sized period immediately before it.</p></div><div class="segmented" role="group" aria-label="Traffic source">'+(['game','website','posthog'] as const).map(s=>'<button data-traffic-source="'+s+'" aria-pressed="'+(source===s)+'">'+(s==='game'?'Game activity':s==='website'?'Website traffic':'PostHog analytics')+'</button>').join('')+'</div></section>'+
      (source==='posthog'?'<section class="panel"><h2>PostHog · ShootBallArena</h2><p>Website audience and browsing activity. Select production traffic or your local development visits.</p><div class="segmented" role="group" aria-label="PostHog traffic scope">'+(['production','development'] as const).map(s=>'<button data-traffic-scope="'+s+'" aria-pressed="'+(scope===s)+'">'+(s==='production'?'Production':'Development')+'</button>').join('')+'</div><p><a href="https://us.posthog.com/project/651980/web" target="_blank" rel="noopener noreferrer">Explore in PostHog ↗</a></p></section>':'')+
      '<div class="traffic-controls"><div class="segmented" role="group" aria-label="Time range">'+Object.keys(TRAFFIC_RANGES).map(r=>'<button data-traffic-range="'+r+'" aria-pressed="'+(range===r)+'">'+r+'</button>').join('')+'</div><label class="compare-toggle"><input id="traffic-compare" type="checkbox" '+(compare?'checked':'')+'>Compare previous period</label></div>'+
      '<div id="traffic-notice">'+(warning?'<p class="notice" role="status">'+warning+'</p>':'')+'</div><div class="metrics traffic-metrics">'+cards+'</div>'+
      '<section class="panel"><div class="traffic-chart-heading"><h2>'+escape(label(metric))+' over time</h2><div class="segmented metric-picker" role="group" aria-label="Chart metric">'+metrics.map(m=>'<button data-traffic-metric="'+m+'" aria-pressed="'+(metric===m)+'">'+label(m)+'</button>').join('')+'</div></div>'+
      '<div class="chart-legend"><span class="current-key">Selected period</span>'+(compare?'<span class="previous-key">Previous period · aligned by elapsed time</span>':'')+'</div>'+
      (history && hasData?chart(history):'<div class="traffic-empty"><strong>'+(loading?'Loading traffic history…':historyFailed?'History could not be loaded':'No history recorded for this period yet')+'</strong><p>History starts when collection is enabled. Earlier traffic cannot be reconstructed.</p></div>')+
      (history && hasData?'<label class="chart-inspector">Inspect interval<input id="traffic-inspector" type="range" min="0" max="'+(history.current.length-1)+'" value="'+(history.current.length-1)+'"></label><p id="traffic-point" class="muted" aria-live="polite"></p>':'')+
      '<p class="muted">'+(source==='game'?'One sample per minute. Lines break where data is missing. Averages and peaks describe observed connected seats, not unique people. Joins omit intervals lost during collection gaps. Coverage: '+number(stats?.coverage)+'%.':source==='posthog'?'PostHog pageviews, distinct visitor IDs and sessions with a pageview. Interval visitors and sessions may overlap; headline totals are deduplicated over the whole period. Zero means no recorded events, not proof of no traffic. Ingestion may be delayed; refreshed at most once per minute.':'Client-reported page loads and new tab sessions, with a 30-minute inactivity reset. Not unique people; blockers and disabled JavaScript can reduce counts. Quiet intervals after collection started show zero.')+'</p></section>'+
      (history && hasData?'<details class="panel traffic-data"><summary>View interval data</summary><div class="table-wrap"><table><thead><tr><th>Interval start</th><th>'+escape(metricLabel(metric))+'</th><th>Previous interval</th><th>Previous value</th>'+(source==='game'?'<th>Samples</th>':'')+'</tr></thead><tbody>'+history.current.map((p,i)=>'<tr><td>'+escape(time(p.at))+'</td><td>'+number(value(p,metric))+'</td><td>'+escape(time(history!.previous[i].at))+'</td><td>'+number(value(history!.previous[i],metric))+'</td>'+(source==='game'?'<td>'+p.samples+'</td>':'')+'</tr>').join('')+'</tbody></table></div></details>':'')+
      '<p class="muted">'+(history?'History updated '+escape(time(history.generatedAt))+(source==='posthog'?' · PostHog project retention applies':' · '+history.retentionDays+'-day retention')+' · All times shown in your local timezone.':'Waiting for a history observation.')+'</p>');
    host.querySelectorAll<HTMLButtonElement>('[data-traffic-source]').forEach(b=>b.onclick=()=>{source=b.dataset.trafficSource as TrafficSource;metric=source==='game'?'players':'views';reload();});
    host.querySelectorAll<HTMLButtonElement>('[data-traffic-range]').forEach(b=>b.onclick=()=>{range=b.dataset.trafficRange as TrafficRange;reload();});
    host.querySelectorAll<HTMLButtonElement>('[data-traffic-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.trafficScope as 'production'|'development';reload();});
    host.querySelectorAll<HTMLButtonElement>('[data-traffic-metric]').forEach(b=>b.onclick=()=>{metric=b.dataset.trafficMetric as Metric;paint();});
    host.querySelector<HTMLInputElement>('#traffic-compare')!.onchange=e=>{compare=(e.target as HTMLInputElement).checked;paint();};
    const slider=host.querySelector<HTMLInputElement>('#traffic-inspector');
    if(slider && history) {
      const inspect=()=>{const i=Number(slider.value),p=history!.current[i],previous=history!.previous[i];host.querySelector('#traffic-point')!.textContent=time(p.at)+': '+number(value(p,metric))+(compare?' · Previous ('+time(previous.at)+'): '+number(value(previous,metric)):'');};
      slider.oninput=inspect;inspect();
    }
  };
  paint();
  await Promise.allSettled([
    get('traffic?source='+selectedSource+'&range='+selectedRange+'&scope='+selectedScope).then(result=>{
      if(!current()) return; history=result as TrafficHistory; cache.set(key,history); loading=false; paint();
    },()=>{if(current()){loading=false;historyFailed=true;paint();}}),
    selectedSource==='game'?get('telemetry').then(result=>{if(current()){live=result;paint();}},()=>{if(current()){liveFailed=true;paint();}}):Promise.resolve(),
  ]);
}
