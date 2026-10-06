import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import ffmpeg from 'ffmpeg-static';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = process.cwd();
const frames = path.join(root, '.test-artifacts/background-frames');
const output = path.join(root, 'apps/web/public/background');
await mkdir(frames, { recursive: true }); await mkdir(output, { recursive: true });
const server = await createServer({ root, server: { host: '127.0.0.1', port: 5191, strictPort: true }, plugins: [{ name: 'offline-capture', configureServer(server) { server.middlewares.use('/capture', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body style="margin:0"><script type="module" src="/scripts/background-scene.ts"></script></body></html>'); }); } }] });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.error(e));
  await page.goto('http://127.0.0.1:5191/capture');
  await page.waitForFunction(() => typeof window.captureFrame === 'function');
  for (let i = 0; i < 330; i++) {
    const png = await page.evaluate(() => window.captureFrame());
    await writeFile(path.join(frames, `${String(i).padStart(4, '0')}.png`), Buffer.from(png, 'base64'));
  }
  function encode(args) { const result = spawnSync(process.env.FFMPEG_PATH || ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' }); if (result.status !== 0) throw new Error('FFmpeg failed'); }
  // Move the first second to the tail and blend across the reset; no backwards shots.
  encode(['-framerate', '30', '-i', path.join(frames, '%04d.png'), '-filter_complex', '[0:v]split[a][b];[a]trim=start=1,setpts=PTS-STARTPTS[main];[b]trim=end=1,setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=1:offset=9,format=yuv420p[out]', '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.BACKGROUND_CRF || '20', '-profile:v', 'main', '-movflags', '+faststart', '-t', '10', path.join(output, 'arena.mp4')]);
  encode(['-i', path.join(output, 'arena.mp4'), '-frames:v', '1', '-c:v', 'libwebp', '-lossless', '1', path.join(output, 'poster.webp')]);
  for (const name of ['arena.mp4', 'poster.webp']) console.log(`${name}: ${(await stat(path.join(output, name))).size} bytes`);
} finally { await browser.close(); await server.close(); }
