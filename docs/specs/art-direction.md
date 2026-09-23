# Art direction

## Purpose
Make movement, facing, shots, and target damage immediately readable.

## Scope and responsibilities
Top-down, fixed-camera rectangular arena; simple generated pixel textures for a circular player, attached cannon, projectiles, and circular dummies. UI explains practice controls and target progress.

## Technical decisions and assumptions
Use a dark navy floor with a subtle grid and clear solid walls. Cyan player, pale cannon, warm yellow projectiles, coral targets; shapes and target health bars supplement color. Tiny raster textures use nearest-neighbor sampling and pixel-art rendering. Keep floor detail low contrast and gameplay silhouettes distinct. Placeholder textures are code-generated; no image generation or Unity art import is needed.

## Initial MVP requirements
Player reads as a ball with one short cannon. Cannon rotates about the ball toward the mouse. Shots remain visible over the floor. Three-segment health bars communicate target damage; removed targets and a remaining-target counter communicate destruction. Arena remains readable when the canvas scales.

## Out of scope now
Detailed characters, cosmetics, animation pipelines, advanced particles, procedural maps, lighting systems, screen shake, and complex shaders.

## Future upgrades
Replace textures without changing gameplay rules. Add restrained hit feedback or sound only after the basic loop is tested; preserve silhouette, palette contrast, and aim readability.
