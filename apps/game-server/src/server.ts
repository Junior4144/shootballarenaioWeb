import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { NETWORK, ROOM_NAME } from '@shootball/protocol';
import { Practice, type ArenaRules } from '@shootball/shared/practice';
import { PracticeRoom } from './PracticeRoom';

export function createServer(rules?: ArenaRules): Server {
  const server = new Server({
    transport: new WebSocketTransport({
      maxPayload: NETWORK.maxPayload, pingInterval: 1000, pingMaxRetries: 2,
    }),
    greet: false,
    gracefullyShutdown: false,
  });
  server.define(ROOM_NAME, rules ? class extends PracticeRoom { protected world = new Practice(rules); } : PracticeRoom);
  return server;
}
