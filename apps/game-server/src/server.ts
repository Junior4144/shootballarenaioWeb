import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { NETWORK, ROOM_NAME } from '@shootball/protocol';
import { PracticeRoom } from './PracticeRoom';

export function createServer(): Server {
  const server = new Server({
    transport: new WebSocketTransport({
      maxPayload: NETWORK.maxPayload, pingInterval: 1000, pingMaxRetries: 2,
    }),
    greet: false,
    gracefullyShutdown: false,
  });
  server.define(ROOM_NAME, PracticeRoom);
  return server;
}
