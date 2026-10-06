# HUD-03: Reference game UI

Status: implemented; automated checks and Chromium browser acceptance pass.
Scope accepted 2026-10-05.

## Contract

Recreate the supplied dark, compact arena reference using existing live state.
UI changes only: preserve world geometry, scrolling camera, FIT dimensions,
input bounds, networking, combat, scoring, pickups and round lifecycle.

- HUD-03A: One thin blue-gray framed shell, navy grid arena on the left and
  narrow leaderboard sidebar on the right. Remove the oversized page heading.
- HUD-03B: Center FREE-FOR-ALL and elapsed round time above the play window;
  align the score target at right. Bottom strip shows heart, numeric health,
  proportional mint health bar, speed state, weapon, ammo and sound control.
  Show shield and respawn status without obscuring the arena.
- HUD-03C: Sidebar contains live human rankings (YOU highlighted), recent
  eliminations, elapsed/total round time, score target and Leave Match / retry.
  Preserve results and reconnect states. Never hard-code sample scores.
- HUD-03D: Keep the full existing play window and pointer coordinates. DOM HUD
  is non-interactive except buttons. Stack sidebar below on narrow screens.
- HUD-03E (deferred): Circular radar/minimap and its reference-positioned Q
  control. No new radar behavior or rendering in this change. Existing Q scan
  and accessible scan control remain available in secondary controls.

## Acceptance

### HUD-03I: Align sidebar to the playable grid only

Latest screenshot corrects HUD-03H: the desktop sidebar spans canvas y=80..592
of 640, excluding both the mode/header and bottom health strip. Keep it flush
with the right gameplay edge and preserve its narrow width. The panel occupies
80% of the fitted frame height, starting at 12.5%. Narrow stacking is unchanged.
Playwright must assert both panel edges against these playable canvas bounds.

Verified: 5 Playwright tests passed (9.4s), including grid-edge alignment within
2px at all three desktop sizes and unchanged narrow layout. Inspected the desktop
screenshot: panel starts at the grid and ends above the health strip. Frontend
typecheck/production build passed. No gameplay code changed.

### HUD-03H: Fill the gameplay side

Latest screenshot supersedes the content-height sidebar in HUD-03G: keep its
narrow width and compact typography, but stretch the panel to match the full
arena frame height. Center the combined frame when width limits its height;
keep the sidebar flush at the right edge. Leave/secondary controls sit at the
bottom. Preserve the narrow-screen stacked layout. Verify sidebar top/bottom
alignment in Playwright as well as the existing adjacency and interaction checks.

Verified: all 5 Playwright tests pass (7.7s), including desktop top/bottom
alignment within 2px at three sizes. Inspected the 1920x1080 screenshot; sidebar
fills the frame height and stays flush. Frontend typecheck/build also pass.

### HUD-03G: Compact adjacent sidebar

Narrow the desktop information panel to 190–220px, increase its base text to
14px, reduce row/section padding, and size the box to its contents. Remove the
inter-panel gap and crop only the canvas's existing 48px blank side rails in
CSS, so the sidebar touches the visible gameplay edge. The original canvas,
camera and pointer coordinates remain unchanged. Fit the resulting 864:640
visible frame to viewport height, with the compact sidebar centered beside it.
Keep the narrow-screen bottom panel and independent sidebar overflow.

Implemented and checked: frontend typecheck/production build and scoped whitespace
check pass. CSS crops 5% of each side of the original canvas, exactly matching
the existing blank rails; the full playable 864px width remains visible. Browser
visual verification is still pending; no gameplay files changed in this update.

### HUD-03F: Full-window layout (2026-10-05)

User follow-up: center the game and make it full screen. Fill the browser viewport
with the game shell, removing the page width cap and outer margins. Center and
maximize the 3:2 arena in the space beside the sidebar without stretching or
cropping it. Keep HUD overlays attached to the fitted canvas. Move secondary
controls and connection information into the sidebar; let that panel scroll
when needed instead of extending the page. On narrow screens, use the bottom
35% of the viewport for the sidebar. Preserve gameplay and deferred radar scope.
Validate frontend build and inspect viewport sizing rules.

Implemented: shell uses the full dynamic viewport; a size-contained arena stage
centers a canvas wrapper sized to min(available width, 1.5 × available height).
Sidebar content scrolls independently. Frontend typecheck/build and scoped
whitespace check passed. Browser visual acceptance remains pending because this
session has no connected browser. Gameplay code was unchanged by this follow-up.

Screenshot follow-up: center the arena and sidebar as one group rather than
centering the arena inside an oversized grid column. Cap the combined width at
the height-fitted canvas width plus sidebar and frame spacing. This removes the
extra inter-panel letterboxing on wide screens while retaining viewport height,
the 8px panel gap, and the existing game aspect ratio. Narrow layouts remain full
width. No camera or gameplay changes.

1. Frontend typecheck and production build pass; existing tests pass.
2. Inspect full/low/zero health, basic/upgraded ammo, boost, protection, respawn,
   results and connection states against the snapshot contract.
3. Browser-check desktop and narrow layout, input pass-through and live HUD if
   a browser is available. Record any unavailable checks explicitly.

Only web presentation files and UI specifications are in scope. No backend,
database, cloud, dependency or game-rule changes.

## Evidence

### Playwright acceptance (2026-10-05)

Supersedes the earlier browser-unavailable limitation below. Added
`apps/web/playwright.config.ts` and `apps/web/e2e/arena.spec.ts`, using isolated
local Vite (5189) and the real Colyseus server (2569).

- `npm.cmd run test:e2e --workspace @shootball/web`: **5 passed (9.6s)**.
- Chromium: 1920x1080, 1366x768, 800x600, 390x844. Verified no page overflow,
  visible-frame ratio, cropping restricted to blank canvas rails, desktop sidebar
  adjacency/width, narrow stacking, health/mute bounds, connected local player,
  numeric health and functional mute. No page errors.
- An SDK observer confirms browser movement changes server position, firing
  creates a server shot event, Leave disconnects that actor, and Join reconnects
  the same actor. The browser also displays the correct active player count.
- Visually inspected desktop and narrow screenshots saved under
  `.test-artifacts/playwright/`; HTML report in `.test-artifacts/playwright-report/`.
- Limits: Chromium only; no touch gameplay, long-duration balance, audio output,
  or complete weapon/death/results browser coverage claimed. Existing simulation
  and transport tests cover those game rules separately.

### Earlier checks

- `npm.cmd run typecheck`: passed for frontend and server.
- `npm.cmd run build --workspace @shootball/web`: passed. Existing large-bundle
  advisory remains (Phaser bundle); no new dependencies.
- `npm.cmd test`: 53 passed (13 frontend, 40 server). The sandbox prevented
  tsx's Windows profile lookup; the same suite passed outside the sandbox.
- Source inspection: health clamps to 0–100 with numeric and accessible meter
  values, low health changes color, basic ammo is unlimited, upgraded ammo uses
  existing weapon capacities, boost and protection use snapshot timers, death
  shows respawn, missing local player shows join state. Results display Finished
  rather than inventing an elapsed finish time absent from the server contract.
- Removed duplicate canvas HUD text; preserved canvas masks, FIT size, camera
  math, fire bounds, input handlers and all authoritative gameplay. Read-only DOM
  overlays pass pointer input through; mute alone opts in. Sidebar stacks below
  at 700px. Arena wrapper keeps its own height even when the sidebar is taller.
- Browser inventory returned no apps or browsers. Desktop/narrow screenshots,
  visual comparison and live aim/mute/reconnect interaction remain unverified.
- Circular radar remains HUD-03E backlog; no new radar work was implemented.
- Existing user edits to Game_Context.md are preserved; its pre-existing trailing
  whitespace is excluded from this change's whitespace check.
