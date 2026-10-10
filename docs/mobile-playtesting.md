# Mobile playtesting

Run `npm run test:e2e --workspace @shootball/web -- mobile.spec.ts` before sharing a build. This checks firing cadence, release/cancellation, two-thumb input, rotation, layout, and Chromium pinch handling. Emulation does not certify Safari or OS gestures.

Before release, use the same deployed build on a real iPhone (Safari), Android phone (Chrome), and desktop. Record the device, OS/browser version, build/commit, orientation, and network. Screen-record failures and write the exact starting screen and gesture sequence.

## Ten-minute device pass

- Hold fire on desktop and hold the aim pad on mobile with the same weapon. Compare sustained firing; adding another finger must not increase the rate.
- Move and aim simultaneously. Release either thumb first; slide off the pads; add a third finger; tap rapidly. Released controls must stop immediately.
- Pinch, double-tap, and swipe starting on the canvas, leaderboard, HUD, header, action buttons, bottom padding/safe area, and gaps between controls. The entire match screen must stay at its original scale. The leaderboard must still scroll.
- Zoom in on the lobby, then enter a match. Pinching inward over gameplay must let you return to normal scale; after recovery, accidental pinch zoom must be blocked again. Return to the lobby and confirm normal zoom is restored.
- Rotate while moving/firing. Open the browser toolbar, switch apps, lock/unlock, and return. No movement or firing should remain stuck; fresh input should work.
- Test edge swipes, opening settings/guide, returning to the lobby, and joining again. Confirm menus remain usable and account/lobby pages retain browser zoom.
- Briefly disconnect/reconnect Wi-Fi. Controls must recover without a reload or stuck firing.
- Play normally for a few minutes in each orientation. Check thumb reach, accidental button presses, heat, and stutters.

Have a few first-time players repeat the pass without coaching. For each reproducible bug, add an automated regression where the browser tooling can model it; keep OS/browser-specific cases in this real-device checklist.

## Bug report

Build/URL; device; OS/browser; orientation; network; starting screen; exact steps; expected/actual result; frequency; screen recording; whether returning to the lobby or reloading recovers it.
