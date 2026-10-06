import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { NETWORK, ROOM_NAME } from '@shootball/protocol';
import { Practice, type ArenaRules } from '@shootball/shared/practice';
import { PracticeRoom } from './PracticeRoom';
import { verifyAccount, type VerifyAccount } from './accountAuth';

export function createServer(rules?: ArenaRules, accountVerifier: VerifyAccount = verifyAccount): Server {
  const server = new Server({
    transport: new WebSocketTransport({
      maxPayload: NETWORK.maxPayload, pingInterval: NETWORK.pingInterval, pingMaxRetries: NETWORK.pingMaxRetries,
    }),
    greet: false,
    gracefullyShutdown: false,
  });
  server.define(ROOM_NAME, class extends PracticeRoom {
    protected world = new Practice(rules);
    protected verifyAccount = accountVerifier;
  }).sortBy({ clients: -1 });
  return server;
}
