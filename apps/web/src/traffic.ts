const PROJECT = 'https://lkgxpgcmspxekggndzih.supabase.co';
const HOSTS = ['shootball-arena.vercel.app','shootball-control-test-730016272076.us-central1.run.app'];
export function websiteVisit(storage: Pick<Storage,'getItem'|'setItem'>, now=Date.now(), uuid=()=>crypto.randomUUID()) {
  let session: {id:string;at:number} | null = null;
  try { session=JSON.parse(storage.getItem('shootball-traffic-session') ?? 'null'); } catch {}
  if (!session || !/^[a-f0-9-]{36}$/.test(session.id) || !Number.isFinite(session.at) || now-session.at>30*60_000 || now<session.at) session={id:uuid(),at:now};
  session.at=now;
  try { storage.setItem('shootball-traffic-session',JSON.stringify(session)); } catch {}
  return {p_event:uuid(),p_session:session.id};
}
/** Client-reported page loads. No account IDs, cookies, referrers or URLs sent. */
export async function recordWebsiteVisit() {
  if (!HOSTS.includes(location.hostname) || import.meta.env.VITE_SUPABASE_URL !== PROJECT) return;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) return;
  try {
    const payload=websiteVisit(sessionStorage);
    await fetch(PROJECT+'/rest/v1/rpc/record_website_visit', {method:'POST',credentials:'omit',referrerPolicy:'no-referrer',
      headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(payload),
      signal:AbortSignal.timeout(5000),redirect:'error',keepalive:true});
  } catch { /* Analytics must never prevent sign-in or gameplay. */ }
}
