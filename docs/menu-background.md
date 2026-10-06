# Menu gameplay film

The login, signup, reset/recovery, account-management and main-menu screens share one decorative video. The shipped choice is a **10-second H.264 MP4, 960x540, 15 fps, no audio track**, with a lossless WebP poster. Nothing in `MenuBackground.ts` imports the game, networking or authentication. The only background requests are same-origin static media.

## Choice and cost comparison

| Approach | Extra download | CPU/GPU work while visible | Memory | Mobile battery | Hosting |
| --- | --- | --- | --- | --- | --- |
| Compressed video (chosen) | 91,230-byte MP4 + 39,736-byte poster (127.9 KiB total) | Native decoding/compositing at 15 fps; no JS simulation or WebGL canvas | Decoder surfaces plus poster; one 960x540 YUV420 frame is about 0.74 MiB, one RGBA frame 1.98 MiB; actual buffering is browser dependent | Expected lowest with hardware H.264 decoding; software decoding can change this | Static storage/egress only |
| Local simulated match | Shared renderer already in application bundle; extra staging/controller code, size not measured | AI/pathfinding/collision ticks plus Phaser rendering and compositing even with a cap | Phaser scene, world, graphics context, textures and render buffers | Sustained CPU + GPU activity; must benchmark on the target phone | Static assets only, no server required |
| Locally rendered replay | Renderer plus compressed snapshots/inputs; replay size not measured | Avoids AI if snapshots, but interpolation and Phaser rendering continue; input replays still simulate | Replay buffer plus renderer and textures | Likely between simulation and hardware-decoded video, device dependent | Static replay storage/egress only |

The measured video is sufficiently small that continuous simulation is not justified for this decorative use. Hardware decoding is an expectation, **not a measured guarantee**. GPU-process memory, hardware decoder selection, energy and physical-device battery drain were not measurable in the headless test environment. The main app already bundles Phaser; this change does not claim to remove that existing JS download or heap cost. No paid service or backend compute is introduced.

For 10,000 cold loads, the two media files transfer approximately 1.31 GB decimal before protocol overhead (about 1.22 GiB). Cost is that egress multiplied by the host's rate; there is no recurring match/server charge. Repeated loops normally use browser-buffered media. Configure normal static-file caching/ETags at the existing host; avoid immutable caching on these stable filenames unless deployment also versions the URLs.

Muted inline playback follows [WebKit's video policy](https://webkit.org/blog/6784/new-video-policies-for-ios/); failed `play()` falls back rather than asking for interaction. See also [web.dev video loading guidance](https://web.dev/learn/performance/video-performance).

## Regeneration

From the repository root, with Node/npm (no Docker):

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run background:generate
```

The dev-only `ffmpeg-static` dependency installs the encoder locally. `FFMPEG_PATH` can override it. `PLAYWRIGHT_BROWSERS_PATH` can point to a local browser cache. The assets are committed under `apps/web/public/background/`, so ordinary development/builds need no encoder or capture server running.

`generate-background.mjs` starts a localhost-only Vite capture page on port 5191, opens Chromium, stages six computer-controlled actors using the shared `Practice` engine and `botInput`, and captures 165 frames. The seeded random stream, 30 Hz fixed simulation step, eight-second warmup and 15 fps output make the staged action reproducible. It uses the actual `drawArena` and `createArenaTextures` renderer functions shared with `ArenaScene`, with a stationary camera and no HUD, names, audio, account code or input handlers. The capture page is not part of the production entry graph. It never creates a game-server connection.

The first second is moved to the tail and blended with the last second to close the loop without reversing projectiles. Expect a restrained one-second dissolve, not a physically periodic simulation. Driver/encoder differences can affect binary output despite identical staged action. Intermediate PNGs stay in ignored `.test-artifacts/background-frames`; they can be removed after regeneration.

Tune `BACKGROUND_CRF` (default 28; lower is clearer/larger), the 960x540 capture dimensions, the frame count/rate and matching FFmpeg trim/transition settings. Keep 15 fps unless target-device testing justifies more. Tune the `.64` overlay in `style.css` for contrast. Keep `object-fit: cover`, `image-rendering: pixelated`, the stationary camera and the opaque form panels. Mobile crops the same film centrally, without downloading a second asset. Re-run browser tests and inspect the loop seam after any content/quality change.

## Lifecycle and verification

- The high-priority poster is in initial HTML over a dark base; fixed positioning reserves no layout space. Video stays transparent until its first `playing` event. Form initialization does not await media.
- Form/lobby switches keep the same element and playback position. Visibility changes pause/resume it; reduced motion removes it and makes no video request on initial load.
- Entering gameplay pauses, removes the source, calls `load()` to abort/release media, and removes the element before creating the gameplay canvas. Returning creates one video. Browser reclamation of native decoder memory is implementation dependent.
- Errors/autoplay denial leave the poster for the lifetime of that controller. The controller has no timers or RAF loop. Disposal removes both global listeners and invalidates late play failures.
- `background.spec.ts` checks 1920x1080, 2560x1440, 390x844 and 320x568, continuous form/lobby transitions, zero gameplay sockets in menus, failed/slow media, rejected autoplay, dynamic reduced motion, visibility pause/resume, repeated gameplay entry/exit, and listener/media cleanup. Visibility is injected through `document.hidden` and the real visibility event handler; physical mobile backgrounding remains a device check.
- Existing auth tests cover session restoration, signup, password recovery and cross-tab session changes with mocked Supabase responses. Real hosted authentication was not exercised by this change.

Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run test:e2e --workspace @shootball/web`. The background browser test logs CDP main-thread task/script duration and JS heap plus decoded/dropped frames; these are not total browser CPU/GPU measurements. Screenshots and performance attachments are in `.test-artifacts/`.

Measured on 2026-10-06 in Windows headless Chromium 153: 5.954 seconds of visible playback, 17.317 ms main-thread task time (~0.29% of elapsed), 0 ms reported script time, 94 total decoded/presented frames reported and zero dropped frames. JS heap was 25,614,176 bytes for the whole menu app including its existing imports, not incremental video memory. Test instrumentation and Vite were present. All 69 unit tests and 56 browser tests passed, then all 10 focused background tests passed after adding the listener-disposal check. Typechecks and production builds passed; the pre-existing large frontend bundle warning remains.
