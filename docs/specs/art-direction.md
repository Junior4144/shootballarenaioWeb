# Art direction

## Frontend UI standard: 2D pixel panels

All current and future frontend UI must use the Field Guide/leaderboard pixel
style, including victory, defeat, draw, empty results, rematch countdown, join,
reconnect/error states, health/loadout, sound, help and any new dialogs.

- Navy page `#0b1720`, opaque panel `#11232e`, teal title bar `#203b48`.
- Square corners, hard 2px borders, crisp inset light/dark bevels. No gradients,
  blurred shadows, glass effects, rounded cards or unrelated component styles.
- Monospace type; uppercase compact headings/actions, readable sentence-case
  explanatory text, aligned numeric stats. Mint for local player/success, amber
  for round emphasis/protection and coral for danger, always paired with text.
- Use shared CSS pixel tokens/primitives for panels, title bars and buttons;
  health meters and icons follow the same hard-edged visual language.
- Results show an explicit outcome, ranked player names and separate points/kill
  stats, with YOU highlighted and the automatic rematch countdown visible.
- Preserve established playfield/sidebar placement, accessible labels/focus,
  keyboard controls, and scrollable content on short/narrow screens. Decorative
  pixels and text must stay inside their component bounds.
- Check new UI states in Playwright at desktop and narrow sizes; presentation
  fixtures may cover rare states but must be labeled separately from live tests.

Preserve the dark navy low-contrast grid, clear walls, circular pixel avatars,
pale cannons and warm shots. Cyan YOU, blue human opponents, amber labelled bots.
Health bars/numeric HP, gold SHIELD outline and death countdown supplement color.
Away avatars dim but stay vulnerable. Six solid cover blocks define routes.

Ground pickups have labels and distinct colors; triangular +5 score orbs and
square upgrade pads differentiate types, with a cross for healing. Radar outlines
captured locations and shows directional marks plus a nearest-objective hint.
Restrained hit flash/cross, elimination rings and kill feed explain combat.
Synthesized shot/hit/death/pickup tones are optional; no imported audio assets.

Leaderboard sits at top right outside the playfield (below on narrow screens).
Preserve readability under FIT scaling. Cosmetics and complex effects are deferred.
Implementation and visual/audio acceptance: [GL-01](../integrationspec/README.md).
