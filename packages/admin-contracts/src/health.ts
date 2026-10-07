import { LINKS, type HealthCheck } from './operations';
export const WEB_HEALTH_TARGETS = [
  { id: 'primary', name: 'Vercel primary website', url: LINKS.primary + '/health' },
  { id: 'origin', name: 'GCP direct origin', url: LINKS.origin + '/health' },
];
export const GAME_HEALTH_TARGET = { id: 'game', name: 'Gameplay process', url: LINKS.game + '/healthz' };
/** Public liveness only: no cookies, bearer tokens or redirected requests. */
export async function probeHealth(target: { id: string; name: string; url: string }, request: typeof fetch = fetch, now = Date.now): Promise<HealthCheck> {
  const started = now();
  let message = 'Network or CORS error reaching the endpoint.';
  try {
    const response = await request(target.url, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store', credentials: 'omit' });
    message = 'Endpoint returned HTTP ' + response.status + '.';
    if (!response.ok) throw new Error();
    message = 'Endpoint did not return valid liveness JSON.';
    const body = await response.json();
    if (body?.status !== 'live' || typeof body.revision !== 'string' || !body.revision) throw new Error();
    return { ...target, status: 'healthy', checkedAt: new Date(now()).toISOString(), latencyMs: now() - started, revision: body.revision.slice(0,100), message: 'HTTPS liveness check passed. This does not prove matchmaking readiness.' };
  } catch (error) {
    if (error instanceof Error && ['TimeoutError','AbortError'].includes(error.name)) message = 'Endpoint timed out after 8 seconds.';
    return { ...target, status: 'unavailable', checkedAt: new Date(now()).toISOString(), latencyMs: now() - started, revision: null, message };
  }
}
