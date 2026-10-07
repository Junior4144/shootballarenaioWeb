import { CONFIG } from '@shootball/shared';
import { createServer } from './server';

const port = Number(process.env.GAME_SERVER_PORT ?? CONFIG.server.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GAME_SERVER_PORT must be 1..65535');
const server = createServer();
const host = process.env.GAME_SERVER_HOST ?? CONFIG.server.host;
if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('GAME_SERVER_HOST must be loopback or 0.0.0.0');
await server.listen(port, host);
console.log(`ShootBall game server listening on ws://${host}:${port}`);
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await server.gracefullyShutdown(false);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
