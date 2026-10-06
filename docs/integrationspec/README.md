# Integration specification tracker

This directory is the working development plan. Core ideas remain in ../specs/;
these integration specs define concrete contracts, dependencies, implementation
status and evidence for changes spanning multiple systems.

## Workflow

1. Record accepted scope, initial values and acceptance checks before coding.
2. Split work into stable IDs; list dependencies and touched interfaces.
3. Update status as work lands: planned / implementing / verified / limited.
4. Verify each contract in simulation, transport and presentation where applicable.
5. Record actual commands/results and unresolved limits. Never mark visual checks
   verified based only on typechecking or headless SDK clients.
6. Future tasks extend this tracker rather than replacing completed evidence.

## Active integration

[GL-01: Points-based arena loop](game-loop.md)

| Workstream | Dependencies | Status | Primary files |
| --- | --- | --- | --- |
| GL-01A Match/scoring contract | none | verified | shared/content, shared/practice, protocol |
| GL-01B Cover and navigation | A types | verified | shared/arena, shared/bots |
| GL-01C Bots and collectible economy | A, B | verified | shared/practice, shared/bots |
| GL-01D Weapons, boosts, radar | A, B, C | verified | shared/practice, server room, protocol |
| GL-01E HUD and feedback | A-D snapshots/events | limited: visual/audio check pending | web scene, HUD, audio, styles |
| GL-01F Integration/regressions | A-E | verified automation; browser limited | tests, README, core specs |

Evidence and remaining checks: [verification](verification.md).

No cloud/Docker/accounts/persistence work is authorized by this integration.
Preserve unrelated working-tree changes, including Game_Context.md.

## Latest checkpoint

2026-10-05: GL-01 implemented; 33 tests, typechecking and both production builds
pass. Real clients cover the loop and built-server bot combat. No browser surface
is available, so visual/audio usability and balance playtests remain open. See
the verification log before starting follow-up tasks.

## HUD-02 follow-up

[Viewport-first arena and transparent HUD](viewport-hud.md): reverted at user request.
The previous centered FIT canvas and separate leaderboard sidebar are restored.
