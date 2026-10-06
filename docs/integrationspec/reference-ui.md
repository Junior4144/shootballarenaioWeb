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

### HUD-03O: Frontend-wide pixel styling

Promote the approved panel style to the core art-direction/frontend specs.
Apply shared palette/bevel primitives to remaining buttons, health HUD, status
badges and all round outcomes. Results use a pixel title bar, outcome message,
readable ranked stat rows and rematch badge. Preserve game rules and layout.
Verify win/loss/draw/empty-result fixtures at desktop and narrow sizes alongside
the existing live-server browser suite. No outcome is computed by the client.

Verified: 13 Playwright tests pass (10.5s): 5 live-server/layout checks plus
8 presentation fixtures for win/loss/draw/empty results at 1366px and 390px.
Fixtures call the real ArenaHud renderer with explicit snapshots and do not
alter production game rules. Assertions cover outcome text, ranking count,
local highlight, countdown, shared pixel styling, horizontal containment and
scroll access to the eighth player. Desktop/narrow victory screenshots inspected.
Frontend typecheck/build pass. Core art-direction is now the required UI standard.

### HUD-03N: Pixel-edge and content containment

Audit both widgets for horizontal overflow and text touching pixel borders.
Keep the established layout, but provide internal breathing room and contain
decorative pixels inside their panels. Check desktop and narrow layouts in
Playwright, including help controls and scoreboard/round/feed sections.

Verified: no horizontal overflow in either panel, scoreboard, round/feed or
control list at all four tested sizes. Added scoreboard edge padding so text
clears the inset pixel border, constrained horizontal panel overflow, and isolated
canvas stacking. All 5 Playwright tests pass (8.2s); frontend build passes.

### HUD-03M: Matching pixel-style scoreboard

Apply the Field Guide's navy/teal palette, hard two-pixel borders, inset bevels,
uppercase title bars and pixel-style buttons to the right sidebar. Retain its
current width, playfield alignment, data, and responsive behavior. Verify existing
Playwright geometry/interaction checks and inspect the rendered desktop panel.

Verified: frontend typecheck/build pass; all 5 Playwright tests pass (8.6s).
Desktop screenshot inspected: both panels share hard teal frames, inset title
bars and beveled buttons. Sidebar remains aligned to the playable grid. An initial
test-runner startup crash left isolated servers running; cleaned up those verified
processes and reran successfully. No gameplay changes.

### HUD-03L: Default-open pixel help widget

The left widget opens automatically on page load, with a blocky pixel-style
frame, beveled keys/buttons, and a clearly labeled close control. Closing leaves
a compact reopen tab in the same rail; neither action shifts gameplay. No saved
closed preference: a fresh page opens the instructions again. Keep responsive
placement and scroll access to long content. Verify default state, close/reopen,
and unchanged gameplay bounds using Playwright.

Verified: all 5 Playwright tests pass (8.5s), including default-open state,
explicit close and reopen, no page overflow, and stable arena bounds. Fixed
short-screen overflow by constraining content to the rail height with internal
scrolling. Desktop pixel styling visually inspected; frontend build passes.

### HUD-03K: Controls outside the playfield

Move help into a dedicated left rail, aligned to the playable grid top. Reserve
the rail's width regardless of expansion so toggling never moves/resizes gameplay.
Keep the right panel flush and preserve the canvas aspect ratio. On narrow screens,
place the help toggle in a fixed-height row below gameplay, with its popup over
the information panel rather than the game. Verify no overlap with gameplay and
unchanged arena bounds when opening/closing the widget.

Verified: all 5 Playwright tests pass (8.5s), including help placement outside
gameplay and stable arena geometry on expansion. Desktop screenshot inspected;
left help aligns with the top of the playable grid. Frontend typecheck/build pass.

### HUD-03J: Readable stats and floating help

Keep the accepted game/sidebar geometry. Match the canvas header/footer masks
to the page navy. Increase right-panel text contrast and hierarchy; remove raw
room identifiers and duplicated player/control explanations. Use "Arena" as a
friendly label (there is no authoritative room number). Put instructions and
the existing scan button/hint in a collapsed left-side overlay widget that never
resizes the canvas or sidebar. Preserve connection errors, retry, and leave.
Verify widget expansion leaves geometry unchanged at all four tested sizes.

Verified: 5 Playwright tests pass (9.1s), including unchanged arena bounds during
help expansion and help contained within the playfield at all four sizes. Inspected
desktop/narrow screenshots and corrected narrow help overflow with an internally
scrolling panel. Frontend typecheck/build passes. Existing radar mechanics remain
unchanged; this widget relocates the already available scan control only.

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
