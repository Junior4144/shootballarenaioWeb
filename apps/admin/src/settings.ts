import { CONFIG } from '../../../packages/shared/src/config';
import { configDiff, validateConfigDocument } from '../../../packages/shared/src/config-document';
const escape = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let draft = structuredClone(CONFIG);
let category = 'player';
let query = '';
let notice = '';
let raw: string | undefined;
function leaves(value: unknown, path: string): [string, unknown][] {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).flatMap(([key,v]) => leaves(v, path ? path + '.' + key : key)) : [[path,value]];
}
function set(path: string, value: unknown) {
  const keys = path.split('.'); let target: any = draft;
  for (const key of keys.slice(0,-1)) target = target[key];
  target[keys.at(-1)!] = value;
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function clearSettings() { draft = structuredClone(CONFIG); raw = undefined; notice = ''; }
export function renderSettings(host: HTMLElement) {
  const errors = validateConfigDocument(draft);
  const diff = configDiff(CONFIG,draft);
  const fields = leaves((draft as any)[category],category).filter(([path]) => path.toLowerCase().includes(query.toLowerCase()));
  host.innerHTML = '<section class="panel"><h2>Game settings draft</h2><p>Edit the configuration bundled with this admin build. Import, validate and download a draft for review. These changes do not affect running matches. Live publication and revision rollback are not connected.</p><div class="actions"><button id="download-default">Download build defaults</button><button id="download-draft" '+(errors.length || raw !== undefined ? 'disabled':'')+'>Download validated draft</button><button id="reset-draft">Reset draft</button><label>Import JSON<input id="import-config" type="file" accept=".json,application/json"></label></div><p role="status">'+escape(notice)+'</p></section>' +
    '<section class="panel"><div class="settings-tools"><label>Category<select id="category">'+Object.keys(CONFIG).filter(k=>k!=='server').map(k=>'<option '+(k===category?'selected':'')+'>'+escape(k)+'</option>').join('')+'</select></label><label>Find field<input id="field-search" type="search" value="'+escape(query)+'"></label></div><p class="muted">Distances: world pixels. Speeds: pixels/second. Times: seconds unless the field ends in Ms. Process host and port are deployment-only.</p><div class="settings-fields">'+fields.map(([path,value])=>'<label>'+escape(path)+(typeof value==='boolean'?'<select data-field="'+path+'" data-kind="boolean"><option '+(value?'selected':'')+'>true</option><option '+(!value?'selected':'')+'>false</option></select>':Array.isArray(value)?'<textarea rows="5" data-field="'+path+'" data-kind="json">'+escape(JSON.stringify(value,null,2))+'</textarea>':'<input data-field="'+path+'" data-kind="'+typeof value+'" type="'+(typeof value==='number'?'number':'text')+'" step="any" value="'+escape(value)+'">')+'</label>').join('')+'</div></section>'+
    '<section class="panel"><h2>Validation</h2><div id="validation">'+(errors.length?'<ul>'+errors.map(e=>'<li>'+escape(e)+'</li>').join('')+'</ul>':'<p>Draft passes shape and semantic checks. Runtime rollout and map connectivity still require release validation.</p>')+'</div></section>'+
    '<section class="panel"><h2>Map preview</h2><p class="muted">Walls in gray, spawn points in mint, pickup pads in amber. Resizing does not move objects automatically.</p><svg class="map-preview" role="img" aria-label="Draft map walls, spawns and pickups" viewBox="'+[draft.map.left,draft.map.top,Math.max(1,draft.map.width),Math.max(1,draft.map.height)].join(' ')+'">'+draft.map.walls.map(w=>'<rect x="'+w.x+'" y="'+w.y+'" width="'+w.width+'" height="'+w.height+'" fill="#607985"/>').join('')+draft.map.spawns.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="'+draft.player.radius+'" fill="#a9ecd3"/>').join('')+draft.map.pickupPads.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="8" fill="#f6d287"/>').join('')+'</svg></section>'+
    '<section class="panel"><h2>Changes from build defaults ('+diff.length+')</h2><div class="table-wrap"><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>'+diff.map(d=>'<tr><th>'+escape(d.path)+'</th><td class="wrap">'+escape(JSON.stringify(d.before))+'</td><td class="wrap">'+escape(JSON.stringify(d.after))+'</td></tr>').join('')+'</tbody></table></div></section>'+
    '<section class="panel"><h2>Advanced JSON</h2><label>Complete configuration<textarea id="config-json" rows="12" spellcheck="false">'+escape(raw ?? JSON.stringify(draft,null,2))+'</textarea></label><button id="validate-json">Validate and apply to draft</button></section>';
  host.querySelector<HTMLSelectElement>('#category')!.onchange=e=>{ category=(e.target as HTMLSelectElement).value; renderSettings(host); };
  host.querySelector<HTMLInputElement>('#field-search')!.oninput=e=>{ query=(e.target as HTMLInputElement).value; const pos=(e.target as HTMLInputElement).selectionStart; renderSettings(host); const input=host.querySelector<HTMLInputElement>('#field-search')!; input.focus(); input.setSelectionRange(pos,pos); };
  host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-field]').forEach(input=> input.onchange=()=>{
    try { const value=input.dataset.kind==='json'?JSON.parse(input.value):input.dataset.kind==='number'?Number(input.value):input.dataset.kind==='boolean'?input.value==='true':input.value;
      const before=structuredClone(draft); set(input.dataset.field!,value);
      // Preserve structurally sound drafts only; semantic errors remain editable.
      const problems=validateConfigDocument(draft);
      if (problems.some(p=>/invalid type|must be an array|must be an object|supported field|too long/.test(p))) { draft=before; notice='Invalid field structure. Use the complete JSON editor to inspect the input.'; }
      else notice='Draft updated; no live changes.';
      raw=undefined; renderSettings(host);
    } catch { notice='Invalid JSON. The previous draft is unchanged.'; renderSettings(host); }
  });
  host.querySelector<HTMLTextAreaElement>('#config-json')!.oninput=e=>{ raw=(e.target as HTMLTextAreaElement).value; host.querySelector<HTMLButtonElement>('#download-draft')!.disabled=true; };
  const adopt=(text: string)=>{ try { if(text.length>250_000) throw new Error('Configuration is too large'); const next=JSON.parse(text); const errors=validateConfigDocument(next); if(errors.length) throw new Error(errors.join('; ')); draft=next; raw=undefined; notice='Validated draft loaded. No live changes.'; } catch(e) { raw=text.slice(0,250_000); notice=e instanceof Error?e.message:'Invalid JSON'; } renderSettings(host); };
  host.querySelector<HTMLButtonElement>('#validate-json')!.onclick=()=>adopt(host.querySelector<HTMLTextAreaElement>('#config-json')!.value);
  host.querySelector<HTMLInputElement>('#import-config')!.onchange=async e=>{ const file=(e.target as HTMLInputElement).files?.[0]; if(file) { if(file.size>250_000) { notice='Maximum import size is 250 KB.'; renderSettings(host); } else adopt(await file.text()); } };
  host.querySelector<HTMLButtonElement>('#download-default')!.onclick=()=>download(CONFIG,'shootball-build-defaults.json');
  host.querySelector<HTMLButtonElement>('#download-draft')!.onclick=()=>{ if(!validateConfigDocument(draft).length && raw===undefined) download(draft,'shootball-config-draft.json'); };
  host.querySelector<HTMLButtonElement>('#reset-draft')!.onclick=()=>{ clearSettings(); notice='Draft reset to build defaults.'; renderSettings(host); };
}
