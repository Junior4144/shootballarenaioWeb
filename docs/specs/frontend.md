# Frontend

TypeScript strict mode, Vite and Phaser 3 remain the frontend stack. Preserve
the 960 x 640 FIT-scaled arena, generated textures, WASD/mouse/click controls,
health bars and target counter. Shared simulation lives in `packages/shared`;
the browser renders server snapshots and never advances gameplay.

Automatically join shared practice. Accessible DOM status displays connecting,
connected (room/player count), reconnecting, disconnected and errors. Provide
leave and retry/join buttons. R requests shared reset. Local avatar says YOU;
remote guests have labels and blue tint. Disconnected avatars are dimmed.

Send intent at 30 Hz; clear keys/queued shots on blur, visibility loss and
connection changes. Disable input outside connected state. No prediction or
interpolation. Clear visuals on permanent leave; clean up listeners on shutdown.

Acceptance: two clients, movement, resize aiming, shared shooting/destruction,
reset, focus recovery, failure/retry and reconnect. Root npm scripts must work
without accounts/credentials. Auth, ads, cosmetics, touch and effects are deferred.

Implemented: server snapshot rendering, multi-avatar labels, connection states,
join/leave/retry and focus clearing. Typecheck/build and connection-controller
integration passed. Visual two-tab, resize/aim and focus smoke tests still need a
browser; none was available during implementation.
