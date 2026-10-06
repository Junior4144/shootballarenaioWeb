# Frontend

Every frontend surface follows the [2D pixel UI standard](art-direction.md),
including the results/win screen and connection, respawn and rematch states.

Strict TypeScript, Vite, Phaser. The canvas uses RESIZE to fill the available playfield below the header, with uniform camera zoom based on a 960 x 640 reference. Desktop side panels fill the remaining screen height; the HUD has a separate 48px row. Camera bounds exclude blank map margins. Preserve WASD, independent
mouse aim, click fire, focus clearing, retry and reconnect. Add Q radar and an
optional sound toggle. The browser presents server state; it does not award points,
resolve collisions, spawn bots, collect pickups or compute radar results.

The top-right sidebar shows active human players, points, PvP kills and bot kills,
with YOU highlighted. It moves below the arena on narrow screens. The HUD includes
match timer/goal, loadout/ammo/boost, health, protection, death/respawn, radar readiness
and a scanned objective hint. Results show winner/draw, rankings and rematch countdown.
Cover, pickups, amber bots, hit flashes/confirmation, elimination effects and kill
feed make the loop readable. Synthesized audio unlocks on user interaction; mute
is optional and gameplay remains usable without sound.

Preserve the 100 ms snapshot buffer; life and round changes snap. Deduplicate
server events and skip historical audio/effects on join/reconnect. Verification:
[GL-01 evidence](../integrationspec/verification.md). Browser visual/audio checks
remain a separate acceptance gate from automated simulation/transport tests.

Current presentation follows [HUD-03](../integrationspec/reference-ui.md): compact
navy frame, centered mode/elapsed timer, target at right, bottom health meter,
speed/weapon/ammo and sound control, and a leaderboard/feed/round/leave sidebar.
The existing scrolling camera and play window stay unchanged. Circular radar UI
is deferred; existing scan controls remain in the secondary controls below.
