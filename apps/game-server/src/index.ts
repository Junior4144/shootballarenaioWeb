import { createServer } from './server';

const port = Number(process.env.GAME_SERVER_PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GAME_SERVER_PORT must be 1..65535');
const server = createServer();
await server.listen(port, '127.0.0.1');
console.log(`ShootBall game server listening on ws://127.0.0.1:${port}`);
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await server.gracefullyShutdown(false);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
