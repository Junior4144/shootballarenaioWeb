import { CONFIG } from '@shootball/shared';
import { createServer } from './server';

const port = Number(process.env.GAME_SERVER_PORT ?? CONFIG.server.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GAME_SERVER_PORT must be 1..65535');
const server = createServer();
await server.listen(port, CONFIG.server.host);
console.log(`ShootBall game server listening on ws://${CONFIG.server.host}:${port}`);
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await server.gracefullyShutdown(false);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
