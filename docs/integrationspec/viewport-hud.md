# HUD-02: Viewport-first arena

Status: reverted at user request. GL-01's centered FIT canvas and separate sidebar layout are restored. The following is the archived proposal.

- The canvas fills the browser viewport with no page margins, large heading or
  document scrolling. Fit the complete authoritative arena inside the viewport;
  preserve its aspect ratio, shapes and world coordinates without cropping walls.
- A transparent leaderboard sits over the top-right game HUD. Read-only overlays
  pass pointer input through to gameplay. Only buttons capture clicks.
- Compact round/connection status at top left; health/loadout/radar at bottom
  left; controls and sound at bottom right. Kill feed sits under leaderboard.
- Remove duplicate text drawn inside the world. Results remain a centered overlay.
- Phaser RESIZE adapts to the viewport; camera zoom/center fit arena bounds.
  Convert pointer screen coordinates through the camera for both aim and fire
  bounds. Do not change movement, collision, scoring, or network contracts.
- Narrow/short screens use smaller HUD spacing and text, keeping controls visible.

Acceptance: frontend typecheck/build; inspect camera/pointer conversion and input
pass-through; browser visual/resize/aim check if a browser surface is available.

Verification: camera-fit and screen-to-world aim/fire conversion inspected; read-only
HUD uses pointer-events:none with explicit button opt-in. Browser discovery returned
no available surface, so visual sizing, overlay readability and resize/aim playtesting
remain unverified. No gameplay/network rules changed.
