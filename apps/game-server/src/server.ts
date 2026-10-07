import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { NETWORK, ROOM_NAME } from '@shootball/protocol';
import { Practice, type ArenaRules } from '@shootball/shared/practice';
import { Telemetry, verifyTelemetryAccess } from './telemetry';
import { PracticeRoom } from './PracticeRoom';
import { verifyAccount, type VerifyAccount } from './accountAuth';

export function createServer(rules?: ArenaRules, accountVerifier: VerifyAccount = verifyAccount, authorizeTelemetry = verifyTelemetryAccess): Server {
  const transport = new WebSocketTransport({
    maxPayload: NETWORK.maxPayload, pingInterval: NETWORK.pingInterval, pingMaxRetries: NETWORK.pingMaxRetries,
  });
  transport.getExpressApp().get('/healthz', (_req: unknown, res: import('node:http').ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'live', revision: process.env.RELEASE_SHA ?? 'development' }));
  });
  const telemetry = new Telemetry();
  let windowAt = Date.now(), requests = 0, inFlight = 0;
  transport.getExpressApp().get('/ops/telemetry', async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    const send = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    res.setHeader('Cache-Control', 'no-store');
    if (Date.now() - windowAt > 60_000) { windowAt = Date.now(); requests = 0; }
    if (++requests > 120 || inFlight >= 8) { send(429, { error: 'Retry later' }); return; }
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith('Bearer ') || bearer.length > 8192) { send(401, { error: 'Administrator sign-in required' }); return; }
    inFlight++;
    try {
      if (!await authorizeTelemetry(bearer.slice(7))) { send(403, { error: 'Administrator access required' }); return; }
      send(200, telemetry.snapshot());
    } catch { send(503, { error: 'Authorization unavailable' }); }
    finally { inFlight--; }
  });
  const server = new Server({
    transport,
    greet: false,
    gracefullyShutdown: false,
  });
  server.define(ROOM_NAME, class extends PracticeRoom {
    protected world = new Practice(rules);
    protected telemetry = telemetry;
    protected verifyAccount = accountVerifier;
  }).sortBy({ clients: -1 });
  return server;
}
